import type {
  CloudReceipt,
  Upload,
  UploadKind,
  UploadProgress,
  UploadStatus,
} from "../contracts/types.ts";
import type { Db } from "../db/open.ts";
import { ConflictError, NotFoundError, ValidationError } from "../db/errors.ts";
import { isCheckViolation, isUniqueViolation } from "../db/sqlite-errors.ts";
import { nowIso, toIso } from "../db/time.ts";
import { withTransaction } from "../db/transaction.ts";

interface UploadRow {
  file_id: string;
  owner_id: string;
  job_id: string | null;
  session_id: string | null;
  kind: UploadKind;
  size_bytes: number;
  sha256: string;
  uploaded_bytes: number;
  chunk_size: number;
  total_chunks: number;
  uploaded_chunks: number;
  status: UploadStatus;
  receipt_id: string | null;
  receipt_verified_at: string | null;
  attempts: number;
  last_error: string | null;
  storage_path: string | null;
}

function toUpload(row: UploadRow): Upload {
  return {
    file_id: row.file_id,
    owner_id: row.owner_id,
    job_id: row.job_id,
    session_id: row.session_id,
    kind: row.kind,
    size_bytes: row.size_bytes,
    sha256: row.sha256,
    progress: {
      uploaded_bytes: row.uploaded_bytes,
      chunk_size: row.chunk_size,
      total_chunks: row.total_chunks,
      uploaded_chunks: row.uploaded_chunks,
    },
    status: row.status,
    cloud_receipt:
      row.receipt_id === null
        ? null
        : { receipt_id: row.receipt_id, verified_at: row.receipt_verified_at as string },
    attempts: row.attempts,
    last_error: row.last_error,
  };
}

export class UploadRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /** storage_path 是管理服务本地文件位置，不属于契约字段。 */
  create(upload: Upload, storagePath: string | null = null): Upload {
    const now = nowIso();
    try {
      this.db
        .prepare(
          `INSERT INTO upload (
             file_id, owner_id, job_id, session_id, kind, size_bytes, sha256,
             uploaded_bytes, chunk_size, total_chunks, uploaded_chunks,
             status, receipt_id, receipt_verified_at, attempts, last_error,
             storage_path, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          upload.file_id,
          upload.owner_id,
          upload.job_id,
          upload.session_id,
          upload.kind,
          upload.size_bytes,
          upload.sha256,
          upload.progress.uploaded_bytes,
          upload.progress.chunk_size,
          upload.progress.total_chunks,
          upload.progress.uploaded_chunks,
          upload.status,
          upload.cloud_receipt?.receipt_id ?? null,
          upload.cloud_receipt === null ? null : toIso(upload.cloud_receipt.verified_at),
          upload.attempts,
          upload.last_error,
          storagePath,
          now,
          now,
        );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`文件已存在：${upload.file_id}`);
      throw error;
    }

    const created = this.get(upload.file_id);
    if (!created) throw new NotFoundError("上传文件", upload.file_id);
    return created;
  }

  get(fileId: string): Upload | null {
    const row = this.db
      .prepare("SELECT * FROM upload WHERE file_id = ?")
      .get(fileId) as unknown as UploadRow | undefined;
    return row ? toUpload(row) : null;
  }

  getChunkSize(fileId: string, chunkIndex: number): number | null {
    const row = this.db
      .prepare("SELECT size_bytes FROM upload_chunk WHERE file_id = ? AND chunk_index = ?")
      .get(fileId, chunkIndex) as unknown as { size_bytes: number } | undefined;
    return row?.size_bytes ?? null;
  }

  getStoragePath(fileId: string): string | null {
    const row = this.db
      .prepare("SELECT storage_path FROM upload WHERE file_id = ?")
      .get(fileId) as unknown as { storage_path: string | null } | undefined;
    return row?.storage_path ?? null;
  }

  updateProgress(fileId: string, progress: UploadProgress): Upload {
    const changes = this.db
      .prepare(
        `UPDATE upload SET
           uploaded_bytes = ?, chunk_size = ?, total_chunks = ?, uploaded_chunks = ?, updated_at = ?
         WHERE file_id = ?`,
      )
      .run(
        progress.uploaded_bytes,
        progress.chunk_size,
        progress.total_chunks,
        progress.uploaded_chunks,
        nowIso(),
        fileId,
      ).changes;
    if (Number(changes) === 0) throw new NotFoundError("上传文件", fileId);
    const updated = this.get(fileId);
    if (!updated) throw new NotFoundError("上传文件", fileId);
    return updated;
  }

  /** 开始一轮上传尝试，attempts +1；已校验/已归档的文件不回退。 */
  markUploading(fileId: string): Upload {
    this.db
      .prepare(
        `UPDATE upload SET status = 'uploading', attempts = attempts + 1, last_error = NULL, updated_at = ?
         WHERE file_id = ? AND status NOT IN ('verified', 'archived')`,
      )
      .run(nowIso(), fileId);
    return this.require(fileId);
  }

  markFailed(fileId: string, error: string): Upload {
    this.db
      .prepare(
        `UPDATE upload SET status = 'failed', last_error = ?, updated_at = ?
         WHERE file_id = ? AND status NOT IN ('verified', 'archived')`,
      )
      .run(error, nowIso(), fileId);
    return this.require(fileId);
  }

  /**
   * 登记一个已落盘的分块并重算进度。重复分块按幂等处理（created=false）。
   * 进度由 upload_chunk 汇总得出，重试不会把计数加重复。
   */
  recordChunk(
    fileId: string,
    chunkIndex: number,
    sizeBytes: number,
    receivedAt: string = nowIso(),
  ): { created: boolean; upload: Upload } {
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      throw new ValidationError("chunk_index 必须为非负整数");
    }

    return withTransaction(this.db, () => {
      const upload = this.get(fileId);
      if (!upload) throw new NotFoundError("上传文件", fileId);
      if (upload.status === "archived") throw new ValidationError("文件已归档，不能再接收分块");
      if (chunkIndex >= upload.progress.total_chunks) {
        throw new ValidationError(
          `chunk_index 越界：${chunkIndex}，总分块 ${upload.progress.total_chunks}`,
        );
      }
      if (sizeBytes < 0 || sizeBytes > upload.progress.chunk_size) {
        throw new ValidationError(`分块大小必须在 0–${upload.progress.chunk_size} 之间`);
      }

      const inserted = this.db
        .prepare(
          `INSERT INTO upload_chunk (file_id, chunk_index, size_bytes, received_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (file_id, chunk_index) DO NOTHING`,
        )
        .run(fileId, chunkIndex, sizeBytes, toIso(receivedAt)).changes;

      try {
        this.db
          .prepare(
            `UPDATE upload SET
               uploaded_chunks = (SELECT COUNT(*) FROM upload_chunk WHERE file_id = ?),
               uploaded_bytes = (SELECT COALESCE(SUM(size_bytes), 0) FROM upload_chunk WHERE file_id = ?),
               status = CASE WHEN status IN ('pending', 'failed') THEN 'uploading' ELSE status END,
               updated_at = ?
             WHERE file_id = ?`,
          )
          .run(fileId, fileId, nowIso(), fileId);
      } catch (error) {
        if (isCheckViolation(error)) {
          throw new ValidationError("分块累计大小超过文件声明大小");
        }
        throw error;
      }

      const updated = this.get(fileId);
      if (!updated) throw new NotFoundError("上传文件", fileId);
      return { created: Number(inserted) > 0, upload: updated };
    });
  }

  /** 本地分块收齐且哈希校验通过后置为 verified；云端回执仍由 verify() 写入。 */
  markIntegrityVerified(fileId: string): Upload {
    this.db
      .prepare(
        `UPDATE upload SET status = 'verified', last_error = NULL, updated_at = ?
         WHERE file_id = ? AND status <> 'archived'`,
      )
      .run(nowIso(), fileId);
    return this.require(fileId);
  }

  /** 云端完整性校验通过后才写入回执。 */
  verify(fileId: string, receipt: CloudReceipt): Upload {
    if (!receipt.receipt_id) throw new ValidationError("回执 ID 不能为空");
    this.db
      .prepare(
        `UPDATE upload SET
           status = 'verified', receipt_id = ?, receipt_verified_at = ?, updated_at = ?
         WHERE file_id = ? AND status <> 'archived'`,
      )
      .run(receipt.receipt_id, toIso(receipt.verified_at), nowIso(), fileId);
    return this.require(fileId);
  }

  /** 无云端回执不得归档。 */
  archive(fileId: string): Upload {
    const current = this.get(fileId);
    if (!current) throw new NotFoundError("上传文件", fileId);
    if (current.cloud_receipt === null) {
      throw new ValidationError("缺少云端校验回执，不能标记为已归档");
    }
    this.db
      .prepare("UPDATE upload SET status = 'archived', updated_at = ? WHERE file_id = ?")
      .run(nowIso(), fileId);
    return this.require(fileId);
  }

  listByStatus(status: UploadStatus, limit = 100): Upload[] {
    const rows = this.db
      .prepare("SELECT * FROM upload WHERE status = ? ORDER BY created_at, file_id LIMIT ?")
      .all(status, limit) as unknown as UploadRow[];
    return rows.map(toUpload);
  }

  listByJob(jobId: string): Upload[] {
    const rows = this.db
      .prepare("SELECT * FROM upload WHERE job_id = ? ORDER BY created_at, file_id")
      .all(jobId) as unknown as UploadRow[];
    return rows.map(toUpload);
  }

  listBySession(sessionId: string): Upload[] {
    const rows = this.db
      .prepare("SELECT * FROM upload WHERE session_id = ? ORDER BY created_at, file_id")
      .all(sessionId) as unknown as UploadRow[];
    return rows.map(toUpload);
  }

  private require(fileId: string): Upload {
    const upload = this.get(fileId);
    if (!upload) throw new NotFoundError("上传文件", fileId);
    return upload;
  }
}