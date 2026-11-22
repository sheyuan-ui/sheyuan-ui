import type {
  ClockQuality,
  Page,
  Session,
  SessionScore,
  SessionStatus,
} from "../contracts/types.ts";
import type { Db } from "../db/open.ts";
import { ConflictError, NotFoundError, StaleVersionError, ValidationError } from "../db/errors.ts";
import { isUniqueViolation } from "../db/sqlite-errors.ts";
import { nowIso, toIso } from "../db/time.ts";
import { withTransaction } from "../db/transaction.ts";

export type ScoreChangeReason = "initial" | "provisional" | "final" | "review" | "reanalysis";

export interface ScoreVersion {
  score: SessionScore;
  recorded_at: string;
  reason: ScoreChangeReason;
}

export interface SessionFilter {
  job_id?: string;
  device_id?: string;
  status?: SessionStatus;
  started_from?: string;
  started_to?: string;
  page?: number;
  page_size?: number;
}

interface SessionRow {
  session_id: string;
  job_id: string;
  device_id: string;
  operator_id: string;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  clock_quality: ClockQuality;
  clock_offset_ms: number | null;
  score_status: SessionScore["status"];
  score_value: number | null;
  valid_event_count: number;
  coverage: number;
  rule_version: string;
  model_version: string;
  score_version: number;
}

interface ScoreVersionRow {
  score_version: number;
  status: SessionScore["status"];
  value: number | null;
  valid_event_count: number;
  coverage: number;
  rule_version: string;
  model_version: string;
  recorded_at: string;
  reason: ScoreChangeReason;
}

function toScore(row: {
  score_status: SessionScore["status"];
  score_value: number | null;
  valid_event_count: number;
  coverage: number;
  rule_version: string;
  model_version: string;
  score_version: number;
}): SessionScore {
  return {
    status: row.score_status,
    value: row.score_value,
    valid_event_count: row.valid_event_count,
    coverage: row.coverage,
    rule_version: row.rule_version,
    model_version: row.model_version,
    score_version: row.score_version,
  };
}

function toSession(row: SessionRow): Session {
  return {
    session_id: row.session_id,
    job_id: row.job_id,
    device_id: row.device_id,
    operator_id: row.operator_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    status: row.status,
    clock_quality: row.clock_quality,
    clock_offset_ms: row.clock_offset_ms,
    score: toScore(row),
  };
}

export class SessionRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  create(session: Session): Session {
    const startedAt = toIso(session.started_at);
    const endedAt = session.ended_at === null ? null : toIso(session.ended_at);
    if (endedAt !== null && endedAt < startedAt) {
      throw new ValidationError("ended_at 不能早于 started_at");
    }
    const now = nowIso();

    try {
      withTransaction(this.db, () => {
        this.db
          .prepare(
            `INSERT INTO session (
               session_id, job_id, device_id, operator_id, started_at, ended_at,
               status, clock_quality, clock_offset_ms,
               score_status, score_value, valid_event_count, coverage,
               rule_version, model_version, score_version,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            session.session_id,
            session.job_id,
            session.device_id,
            session.operator_id,
            startedAt,
            endedAt,
            session.status,
            session.clock_quality,
            session.clock_offset_ms,
            session.score.status,
            session.score.value,
            session.score.valid_event_count,
            session.score.coverage,
            session.score.rule_version,
            session.score.model_version,
            session.score.score_version,
            now,
            now,
          );

        this.writeScoreVersion(session.session_id, session.score, "initial", now);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`会话已存在：${session.session_id}`);
      throw error;
    }

    const created = this.get(session.session_id);
    if (!created) throw new NotFoundError("会话", session.session_id);
    return created;
  }

  get(sessionId: string): Session | null {
    const row = this.db
      .prepare("SELECT * FROM session WHERE session_id = ?")
      .get(sessionId) as unknown as SessionRow | undefined;
    return row ? toSession(row) : null;
  }

  /**
   * 更新评分。score_version 减小按陈旧数据拒绝；相同版本原地更新暂评；
   * 递增版本另存历史。人工复核必须递增版本并给出 reason=review。
   */
  saveScore(
    sessionId: string,
    score: SessionScore,
    reason: ScoreChangeReason = "provisional",
    recordedAt: string = nowIso(),
  ): Session {
    return withTransaction(this.db, () => {
      const row = this.db
        .prepare("SELECT score_version FROM session WHERE session_id = ?")
        .get(sessionId) as unknown as { score_version: number } | undefined;
      if (!row) throw new NotFoundError("会话", sessionId);
      if (score.score_version < row.score_version) {
        throw new StaleVersionError(
          `评分版本回退：收到 ${score.score_version}，当前 ${row.score_version}`,
        );
      }

      const now = toIso(recordedAt);
      this.db
        .prepare(
          `UPDATE session SET
             score_status = ?, score_value = ?, valid_event_count = ?, coverage = ?,
             rule_version = ?, model_version = ?, score_version = ?, updated_at = ?
           WHERE session_id = ?`,
        )
        .run(
          score.status,
          score.value,
          score.valid_event_count,
          score.coverage,
          score.rule_version,
          score.model_version,
          score.score_version,
          now,
          sessionId,
        );

      this.writeScoreVersion(sessionId, score, reason, now);

      const updated = this.get(sessionId);
      if (!updated) throw new NotFoundError("会话", sessionId);
      return updated;
    });
  }

  end(sessionId: string, status: Exclude<SessionStatus, "active">, endedAt: string = nowIso()): Session {
    const session = this.get(sessionId);
    if (!session) throw new NotFoundError("会话", sessionId);
    const ended = toIso(endedAt);
    if (ended < session.started_at) throw new ValidationError("ended_at 不能早于 started_at");

    this.db
      .prepare("UPDATE session SET status = ?, ended_at = ?, updated_at = ? WHERE session_id = ?")
      .run(status, ended, nowIso(), sessionId);

    const updated = this.get(sessionId);
    if (!updated) throw new NotFoundError("会话", sessionId);
    return updated;
  }

  list(filter: SessionFilter = {}): Page<Session> {
    const page = filter.page ?? 1;
    const pageSize = filter.page_size ?? 50;
    if (!Number.isInteger(page) || page < 1) throw new ValidationError("page 必须为不小于 1 的整数");
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
      throw new ValidationError("page_size 必须在 1–200 之间");
    }

    const where: string[] = [];
    const params: string[] = [];
    if (filter.job_id !== undefined) {
      where.push("job_id = ?");
      params.push(filter.job_id);
    }
    if (filter.device_id !== undefined) {
      where.push("device_id = ?");
      params.push(filter.device_id);
    }
    if (filter.status !== undefined) {
      where.push("status = ?");
      params.push(filter.status);
    }
    if (filter.started_from !== undefined) {
      where.push("started_at >= ?");
      params.push(toIso(filter.started_from));
    }
    if (filter.started_to !== undefined) {
      where.push("started_at <= ?");
      params.push(toIso(filter.started_to));
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      this.db.prepare(`SELECT COUNT(*) AS n FROM session ${whereSql}`).get(...params)?.n ?? 0,
    );
    const rows = this.db
      .prepare(
        `SELECT * FROM session ${whereSql}
         ORDER BY started_at DESC, session_id
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as SessionRow[];

    return { items: rows.map(toSession), page, page_size: pageSize, total };
  }

  listByJob(jobId: string): Session[] {
    const rows = this.db
      .prepare("SELECT * FROM session WHERE job_id = ? ORDER BY started_at, session_id")
      .all(jobId) as unknown as SessionRow[];
    return rows.map(toSession);
  }

  listByDevice(deviceId: string, limit = 50): Session[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM session WHERE device_id = ? ORDER BY started_at DESC, session_id LIMIT ?",
      )
      .all(deviceId, limit) as unknown as SessionRow[];
    return rows.map(toSession);
  }

  /** 评分历史，按 score_version 升序；用于复核记录与报告追溯。 */
  listScoreVersions(sessionId: string): ScoreVersion[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM session_score_version WHERE session_id = ? ORDER BY score_version",
      )
      .all(sessionId) as unknown as ScoreVersionRow[];
    return rows.map((row) => ({
      score: toScore({
        score_status: row.status,
        score_value: row.value,
        valid_event_count: row.valid_event_count,
        coverage: row.coverage,
        rule_version: row.rule_version,
        model_version: row.model_version,
        score_version: row.score_version,
      }),
      recorded_at: row.recorded_at,
      reason: row.reason,
    }));
  }

  private writeScoreVersion(
    sessionId: string,
    score: SessionScore,
    reason: ScoreChangeReason,
    recordedAt: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO session_score_version (
           session_id, score_version, status, value, valid_event_count, coverage,
           rule_version, model_version, recorded_at, reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (session_id, score_version) DO UPDATE SET
           status = excluded.status,
           value = excluded.value,
           valid_event_count = excluded.valid_event_count,
           coverage = excluded.coverage,
           rule_version = excluded.rule_version,
           model_version = excluded.model_version,
           recorded_at = excluded.recorded_at`,
      )
      .run(
        sessionId,
        score.score_version,
        score.status,
        score.value,
        score.valid_event_count,
        score.coverage,
        score.rule_version,
        score.model_version,
        recordedAt,
        reason,
      );
  }
}