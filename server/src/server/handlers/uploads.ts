import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { dirname, join } from "node:path";
import { API, WS_TOPICS } from "../../contracts/api.ts";
import type { Upload, UploadKind } from "../../contracts/types.ts";
import { readJsonBody } from "../body.ts";
import { HttpError } from "../http-errors.ts";
import { requestFingerprint, withIdempotency } from "../idempotency.ts";
import { queryInt } from "../query.ts";
import type { Router } from "../router.ts";
import { asObject, enumOf, int, nullableStr, str } from "../validate.ts";

const KINDS: readonly UploadKind[] = [
  "job_meta",
  "event_log",
  "screenshot",
  "event_clip",
  "full_recording",
];

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_CHUNK_SIZE = 64 * 1024 * 1024;
const FILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

async function readChunk(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) {
      throw new HttpError("PAYLOAD_TOO_LARGE", `分块超过 chunk_size 上限 ${limit} 字节`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function writeChunk(path: string, offset: number, buffer: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  try {
    const created = await open(path, "wx");
    await created.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  // 不用 a+：O_APPEND 会忽略写入偏移；r+ 才能按分块位置落盘
  const handle = await open(path, "r+");
  try {
    await handle.write(buffer, 0, buffer.length, offset);
  } finally {
    await handle.close();
  }
}

async function fileDigest(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  try {
    for await (const chunk of stream) hash.update(chunk as Buffer);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createHash("sha256").digest("hex");
    }
    throw error;
  }
  return hash.digest("hex");
}

function buildUpload(value: unknown): Upload {
  const input = asObject(value);
  const fileId = input.file_id === undefined ? randomUUID() : str(input, "file_id");
  if (!FILE_ID_PATTERN.test(fileId)) {
    throw new HttpError("INVALID_ARGUMENT", "file_id 只能包含字母、数字、点、下划线和短横线", {
      file_id: FILE_ID_PATTERN.source,
    });
  }

  const sizeBytes = int(input, "size_bytes", { min: 0 });
  const chunkSize =
    input.chunk_size === undefined
      ? DEFAULT_CHUNK_SIZE
      : int(input, "chunk_size", { min: 1, max: MAX_CHUNK_SIZE });
  const sha256 = str(input, "sha256");
  if (!SHA256_PATTERN.test(sha256)) {
    throw new HttpError("INVALID_ARGUMENT", "sha256 必须为 64 位小写十六进制", {
      sha256: "64 lowercase hex",
    });
  }

  return {
    file_id: fileId,
    owner_id: str(input, "owner_id"),
    job_id: nullableStr(input, "job_id"),
    session_id: nullableStr(input, "session_id"),
    kind: enumOf(input, "kind", KINDS),
    size_bytes: sizeBytes,
    sha256,
    progress: {
      uploaded_bytes: 0,
      chunk_size: chunkSize,
      total_chunks: sizeBytes === 0 ? 0 : Math.ceil(sizeBytes / chunkSize),
      uploaded_chunks: 0,
    },
    status: "pending",
    cloud_receipt: null,
    attempts: 0,
    last_error: null,
  };
}

export function registerUploadRoutes(router: Router): void {
  router.add("POST", API.uploads, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "uploads.create", requestFingerprint(body.raw), () => {
      const upload = buildUpload(body.value);

      if (upload.job_id !== null && !ctx.repos.jobs.get(upload.job_id)) {
        throw new HttpError("NOT_FOUND", `任务不存在：${upload.job_id}`);
      }
      if (upload.session_id !== null && !ctx.repos.sessions.get(upload.session_id)) {
        throw new HttpError("NOT_FOUND", `会话不存在：${upload.session_id}`);
      }

      const created = ctx.repos.uploads.create(
        upload,
        join(ctx.uploadDir, `${upload.file_id}.part`),
      );
      return { status: 201, data: created };
    });
  });

  router.add("GET", API.upload(":id"), (ctx) => {
    const fileId = ctx.params.id as string;
    const upload = ctx.repos.uploads.get(fileId);
    if (!upload) throw new HttpError("NOT_FOUND", `上传文件不存在：${fileId}`);
    return { status: 200, data: upload };
  });

  router.add("POST", API.uploadChunks(":id"), async (ctx) => {
    const fileId = ctx.params.id as string;
    const chunkIndex = queryInt(ctx.url, "chunk_index", { min: 0 });
    if (chunkIndex === undefined) {
      throw new HttpError("INVALID_ARGUMENT", "缺少 chunk_index", { chunk_index: "required" });
    }
    // 分块是二进制流，先按 文件+序号+长度 占位，再消费请求体
    const length = ctx.req.headers["content-length"] ?? "chunked";
    const hash = requestFingerprint(`chunk:${fileId}:${chunkIndex}:${length}`);

    return withIdempotency(
      ctx,
      "uploads.chunk",
      hash,
      async () => {
        const upload = ctx.repos.uploads.get(fileId);
        if (!upload) throw new HttpError("NOT_FOUND", `上传文件不存在：${fileId}`);
        if (upload.status === "archived") {
          throw new HttpError("CONFLICT", "文件已归档，不能再接收分块");
        }
        if (chunkIndex >= upload.progress.total_chunks) {
          throw new HttpError("INVALID_ARGUMENT", `chunk_index 越界：${chunkIndex}`, {
            total_chunks: String(upload.progress.total_chunks),
          });
        }

        const buffer = await readChunk(ctx.req, upload.progress.chunk_size);
        const existing = ctx.repos.uploads.getChunkSize(fileId, chunkIndex);
        if (existing !== null) {
          if (existing !== buffer.length) {
            throw new HttpError("CONFLICT", "同一分块重复上传但长度不一致", {
              chunk_index: String(chunkIndex),
              received_bytes: String(existing),
              request_bytes: String(buffer.length),
            });
          }
          return { status: 200, data: upload };
        }

        const path = ctx.repos.uploads.getStoragePath(fileId) ?? join(ctx.uploadDir, `${fileId}.part`);
        await writeChunk(path, chunkIndex * upload.progress.chunk_size, buffer);
        const { upload: updated } = ctx.repos.uploads.recordChunk(fileId, chunkIndex, buffer.length);
        ctx.hub.publish(WS_TOPICS.uploadProgress, updated);
        return { status: 200, data: updated };
      },
      { onReplay: () => ctx.req.resume() },
    );
  });

  router.add("POST", API.uploadComplete(":id"), async (ctx) => {
    const body = await readJsonBody(ctx.req, true);
    return withIdempotency(
      ctx,
      "uploads.complete",
      requestFingerprint(`complete:${body.raw}`),
      async () => {
        const fileId = ctx.params.id as string;
        const upload = ctx.repos.uploads.get(fileId);
        if (!upload) throw new HttpError("NOT_FOUND", `上传文件不存在：${fileId}`);
        if (upload.status === "verified" || upload.status === "archived") {
          return { status: 200, data: upload };
        }

        const missing = upload.progress.total_chunks - upload.progress.uploaded_chunks;
        if (missing > 0) {
          throw new HttpError("CONFLICT", `还有 ${missing} 个分块未上传`, {
            missing_chunks: String(missing),
          });
        }

        const path = ctx.repos.uploads.getStoragePath(fileId) ?? join(ctx.uploadDir, `${fileId}.part`);
        const digest = await fileDigest(path);
        if (digest !== upload.sha256) {
          ctx.repos.uploads.markFailed(fileId, "sha256 mismatch");
          throw new HttpError("UPLOAD_HASH_MISMATCH", "文件校验失败", {
            expected: upload.sha256,
            actual: digest,
          });
        }

        const verified = ctx.repos.uploads.markIntegrityVerified(fileId);
        ctx.hub.publish(WS_TOPICS.uploadProgress, verified);
        return { status: 200, data: verified };
      },
    );
  });
}