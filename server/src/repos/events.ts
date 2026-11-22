import type { Evaluability, Event, EventReview, ReviewConclusion } from "../contracts/types.ts";
import type { Db } from "../db/open.ts";
import { ConflictError, NotFoundError } from "../db/errors.ts";
import { isUniqueViolation } from "../db/sqlite-errors.ts";
import { nowIso, toIso } from "../db/time.ts";
import { withTransaction } from "../db/transaction.ts";

interface EventRow {
  event_id: string;
  session_id: string;
  device_monotonic_ms: number;
  utc: string;
  action: string;
  confidence: number;
  rule_id: string | null;
  evaluability: Evaluability;
  clip_start_ms: number;
  clip_end_ms: number;
  review_conclusion: ReviewConclusion;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_remark: string | null;
}

function toEvent(row: EventRow): Event {
  return {
    event_id: row.event_id,
    session_id: row.session_id,
    time: { device_monotonic_ms: row.device_monotonic_ms, utc: row.utc },
    action: row.action,
    confidence: row.confidence,
    rule_id: row.rule_id,
    evaluability: row.evaluability,
    clip: { start_ms: row.clip_start_ms, end_ms: row.clip_end_ms },
    review: {
      conclusion: row.review_conclusion,
      reviewer_id: row.reviewer_id,
      reviewed_at: row.reviewed_at,
      remark: row.review_remark,
    },
  };
}

export class EventRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  insert(event: Event): Event {
    const now = nowIso();
    try {
      this.insertRow(event, now);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`事件已存在：${event.event_id}`);
      throw error;
    }
    const created = this.get(event.event_id);
    if (!created) throw new NotFoundError("事件", event.event_id);
    return created;
  }

  /** 批量写入同一会话的事件；任一失败整批回滚。 */
  insertMany(events: Event[]): number {
    const now = nowIso();
    withTransaction(this.db, () => {
      for (const event of events) {
        try {
          this.insertRow(event, now);
        } catch (error) {
          if (isUniqueViolation(error)) throw new ConflictError(`事件已存在：${event.event_id}`);
          throw error;
        }
      }
    });
    return events.length;
  }

  get(eventId: string): Event | null {
    const row = this.db
      .prepare("SELECT * FROM event WHERE event_id = ?")
      .get(eventId) as unknown as EventRow | undefined;
    return row ? toEvent(row) : null;
  }

  /** 按设备单调时间排序，与视频时间轴一致。 */
  listBySession(sessionId: string): Event[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM event WHERE session_id = ? ORDER BY device_monotonic_ms, event_id",
      )
      .all(sessionId) as unknown as EventRow[];
    return rows.map(toEvent);
  }

  countByReview(sessionId: string, conclusion: ReviewConclusion): number {
    return Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM event WHERE session_id = ? AND review_conclusion = ?",
        )
        .get(sessionId, conclusion)?.n ?? 0,
    );
  }

  /**
   * 写人工复核结论：event 保存最新结论，event_review_log 逐条留痕；
   * 原始 AI 判定（action / confidence / clip / evaluability）不被覆盖。
   */
  review(eventId: string, review: EventReview, at: string = nowIso()): Event {
    return withTransaction(this.db, () => {
      const existing = this.db
        .prepare("SELECT event_id FROM event WHERE event_id = ?")
        .get(eventId);
      if (!existing) throw new NotFoundError("事件", eventId);

      const now = toIso(at);
      const reviewedAt = review.reviewed_at === null ? null : toIso(review.reviewed_at);

      this.db
        .prepare(
          `UPDATE event SET
             review_conclusion = ?, reviewer_id = ?, reviewed_at = ?, review_remark = ?
           WHERE event_id = ?`,
        )
        .run(review.conclusion, review.reviewer_id, reviewedAt, review.remark, eventId);

      const seq = Number(
        this.db
          .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM event_review_log WHERE event_id = ?")
          .get(eventId)?.next ?? 1,
      );
      this.db
        .prepare(
          `INSERT INTO event_review_log (
             event_id, seq, conclusion, reviewer_id, reviewed_at, remark, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(eventId, seq, review.conclusion, review.reviewer_id, reviewedAt, review.remark, now);

      const updated = this.get(eventId);
      if (!updated) throw new NotFoundError("事件", eventId);
      return updated;
    });
  }

  listReviewHistory(eventId: string): {
    seq: number;
    conclusion: ReviewConclusion;
    reviewer_id: string | null;
    reviewed_at: string | null;
    remark: string | null;
    created_at: string;
  }[] {
    return this.db
      .prepare("SELECT * FROM event_review_log WHERE event_id = ? ORDER BY seq")
      .all(eventId) as unknown as {
      seq: number;
      conclusion: ReviewConclusion;
      reviewer_id: string | null;
      reviewed_at: string | null;
      remark: string | null;
      created_at: string;
    }[];
  }

  private insertRow(event: Event, now: string): void {
    this.db
      .prepare(
        `INSERT INTO event (
           event_id, session_id, device_monotonic_ms, utc, action, confidence, rule_id,
           evaluability, clip_start_ms, clip_end_ms,
           review_conclusion, reviewer_id, reviewed_at, review_remark, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.event_id,
        event.session_id,
        event.time.device_monotonic_ms,
        toIso(event.time.utc),
        event.action,
        event.confidence,
        event.rule_id,
        event.evaluability,
        event.clip.start_ms,
        event.clip.end_ms,
        event.review.conclusion,
        event.review.reviewer_id,
        event.review.reviewed_at === null ? null : toIso(event.review.reviewed_at),
        event.review.remark,
        now,
      );
  }
}