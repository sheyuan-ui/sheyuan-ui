import type { Job, JobStatus, Page, Scenario } from "../contracts/types.ts";
import type { Db } from "../db/open.ts";
import { ConflictError, NotFoundError, ValidationError } from "../db/errors.ts";
import { isUniqueViolation } from "../db/sqlite-errors.ts";
import { nowIso, toIso } from "../db/time.ts";
import { withTransaction } from "../db/transaction.ts";

export interface JobFilter {
  farm_id?: string;
  house_id?: string;
  batch_id?: string;
  scenario?: Scenario;
  status?: JobStatus;
  /** 按 created_at 过滤，UTC ISO 8601 */
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
}

interface JobRow {
  job_id: string;
  farm_id: string;
  house_id: string;
  scenario: Scenario;
  batch_id: string;
  owner_name: string;
  location_farm_id: string;
  location_farm_name: string;
  location_house_id: string;
  location_house_name: string;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_accuracy_m: number | null;
  geo_source: "ipad_gps" | "manual" | null;
  geo_captured_at: string | null;
  status: JobStatus;
  remark: string | null;
  created_at: string;
}

function toJob(row: JobRow, attachmentIds: string[]): Job {
  return {
    job_id: row.job_id,
    farm_id: row.farm_id,
    house_id: row.house_id,
    scenario: row.scenario,
    batch_id: row.batch_id,
    owner_name: row.owner_name,
    location: {
      farm_id: row.location_farm_id,
      farm_name: row.location_farm_name,
      house_id: row.location_house_id,
      house_name: row.location_house_name,
      geo:
        row.geo_lat === null
          ? null
          : {
              lat: row.geo_lat,
              lng: row.geo_lng as number,
              accuracy_m: row.geo_accuracy_m as number,
              source: row.geo_source as "ipad_gps" | "manual",
              captured_at: row.geo_captured_at as string,
            },
    },
    attachment_ids: attachmentIds,
    status: row.status,
    remark: row.remark,
    created_at: row.created_at,
  };
}

export class JobRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /** 创建任务，附件按 attachment_ids 顺序保存；地点快照必须与任务场区/栋舍一致。 */
  create(job: Job): Job {
    if (job.location.farm_id !== job.farm_id || job.location.house_id !== job.house_id) {
      throw new ValidationError("地点快照的 farm_id / house_id 必须与任务一致");
    }
    const attachmentIds = job.attachment_ids;
    if (new Set(attachmentIds).size !== attachmentIds.length) {
      throw new ValidationError("attachment_ids 不能重复");
    }

    try {
      withTransaction(this.db, () => {
        this.db
          .prepare(
            `INSERT INTO job (
               job_id, farm_id, house_id, scenario, batch_id, owner_name,
               location_farm_id, location_farm_name, location_house_id, location_house_name,
               geo_lat, geo_lng, geo_accuracy_m, geo_source, geo_captured_at,
               status, remark, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            job.job_id,
            job.farm_id,
            job.house_id,
            job.scenario,
            job.batch_id,
            job.owner_name,
            job.location.farm_id,
            job.location.farm_name,
            job.location.house_id,
            job.location.house_name,
            job.location.geo?.lat ?? null,
            job.location.geo?.lng ?? null,
            job.location.geo?.accuracy_m ?? null,
            job.location.geo?.source ?? null,
            job.location.geo ? toIso(job.location.geo.captured_at) : null,
            job.status,
            job.remark,
            toIso(job.created_at),
            nowIso(),
          );

        const insertAttachment = this.db.prepare(
          "INSERT INTO job_attachment (job_id, file_id, position) VALUES (?, ?, ?)",
        );
        attachmentIds.forEach((fileId, position) => {
          insertAttachment.run(job.job_id, fileId, position);
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`任务已存在：${job.job_id}`);
      throw error;
    }

    const created = this.get(job.job_id);
    if (!created) throw new NotFoundError("任务", job.job_id);
    return created;
  }

  get(jobId: string): Job | null {
    const row = this.db
      .prepare("SELECT * FROM job WHERE job_id = ?")
      .get(jobId) as unknown as JobRow | undefined;
    if (!row) return null;

    const attachmentIds = this.db
      .prepare("SELECT file_id FROM job_attachment WHERE job_id = ? ORDER BY position")
      .all(jobId)
      .map((item) => (item as { file_id: string }).file_id);

    return toJob(row, attachmentIds);
  }

  /** 追加附件 ID（文件本体由上传接口管理）；重复添加保持幂等。 */
  addAttachment(jobId: string, fileId: string): Job {
    if (!fileId) throw new ValidationError("file_id 不能为空");

    return withTransaction(this.db, () => {
      const exists = this.db.prepare("SELECT 1 AS ok FROM job WHERE job_id = ?").get(jobId);
      if (!exists) throw new NotFoundError("任务", jobId);

      const linked = this.db
        .prepare("SELECT 1 AS ok FROM job_attachment WHERE job_id = ? AND file_id = ?")
        .get(jobId, fileId);
      if (!linked) {
        const next = Number(
          this.db
            .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM job_attachment WHERE job_id = ?")
            .get(jobId)?.next ?? 0,
        );
        this.db
          .prepare("INSERT INTO job_attachment (job_id, file_id, position) VALUES (?, ?, ?)")
          .run(jobId, fileId, next);
      }

      const job = this.get(jobId);
      if (!job) throw new NotFoundError("任务", jobId);
      return job;
    });
  }

  updateStatus(jobId: string, status: JobStatus): Job {
    const changes = this.db
      .prepare("UPDATE job SET status = ?, updated_at = ? WHERE job_id = ?")
      .run(status, nowIso(), jobId).changes;
    if (Number(changes) === 0) throw new NotFoundError("任务", jobId);
    const job = this.get(jobId);
    if (!job) throw new NotFoundError("任务", jobId);
    return job;
  }

  list(filter: JobFilter = {}): Page<Job> {
    const page = filter.page ?? 1;
    const pageSize = filter.page_size ?? 50;
    if (!Number.isInteger(page) || page < 1) throw new ValidationError("page 必须为不小于 1 的整数");
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
      throw new ValidationError("page_size 必须在 1–200 之间");
    }

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filter.farm_id !== undefined) {
      where.push("farm_id = ?");
      params.push(filter.farm_id);
    }
    if (filter.house_id !== undefined) {
      where.push("house_id = ?");
      params.push(filter.house_id);
    }
    if (filter.batch_id !== undefined) {
      where.push("batch_id = ?");
      params.push(filter.batch_id);
    }
    if (filter.scenario !== undefined) {
      where.push("scenario = ?");
      params.push(filter.scenario);
    }
    if (filter.status !== undefined) {
      where.push("status = ?");
      params.push(filter.status);
    }
    if (filter.created_from !== undefined) {
      where.push("created_at >= ?");
      params.push(toIso(filter.created_from));
    }
    if (filter.created_to !== undefined) {
      where.push("created_at <= ?");
      params.push(toIso(filter.created_to));
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      this.db.prepare(`SELECT COUNT(*) AS n FROM job ${whereSql}`).get(...params)?.n ?? 0,
    );
    const rows = this.db
      .prepare(
        `SELECT * FROM job ${whereSql}
         ORDER BY created_at DESC, job_id
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as JobRow[];

    const items = rows.map((row) => {
      const attachmentIds = this.db
        .prepare("SELECT file_id FROM job_attachment WHERE job_id = ? ORDER BY position")
        .all(row.job_id)
        .map((item) => (item as { file_id: string }).file_id);
      return toJob(row, attachmentIds);
    });

    return { items, page, page_size: pageSize, total };
  }

  listByDevice(deviceId: string, limit = 50): Job[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT j.* FROM job j
         JOIN session s ON s.job_id = j.job_id
         WHERE s.device_id = ?
         ORDER BY j.created_at DESC, j.job_id
         LIMIT ?`,
      )
      .all(deviceId, limit) as unknown as JobRow[];
    return rows.map((row) => {
      const attachmentIds = this.db
        .prepare("SELECT file_id FROM job_attachment WHERE job_id = ? ORDER BY position")
        .all(row.job_id)
        .map((item) => (item as { file_id: string }).file_id);
      return toJob(row, attachmentIds);
    });
  }
}