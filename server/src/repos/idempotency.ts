import type { Db } from "../db/open.ts";
import { NotFoundError } from "../db/errors.ts";
import { isoAfter, nowIso, toIso } from "../db/time.ts";
import { withTransaction } from "../db/transaction.ts";

export type IdempotencyReservation =
  | { kind: "new" }
  | { kind: "in_progress" }
  | { kind: "replay"; status_code: number; response_json: string }
  | { kind: "conflict" };

interface KeyRow {
  request_hash: string;
  status_code: number | null;
  response_json: string | null;
  expires_at: string;
}

export class IdempotencyRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * 在执行业务副作用前占位。同一 scope + key：
   * 指纹不同 → conflict；已有响应 → replay；未完成 → in_progress；过期 → 重新占位。
   */
  reserve(
    scope: string,
    key: string,
    requestHash: string,
    ttlMs = 24 * 60 * 60 * 1000,
    at: string = nowIso(),
  ): IdempotencyReservation {
    const now = toIso(at);
    return withTransaction(this.db, () => {
      const row = this.db
        .prepare("SELECT * FROM idempotency_key WHERE scope = ? AND key = ?")
        .get(scope, key) as unknown as KeyRow | undefined;

      if (row) {
        if (row.expires_at > now) {
          if (row.request_hash !== requestHash) return { kind: "conflict" } as const;
          if (row.response_json === null || row.status_code === null) {
            return { kind: "in_progress" } as const;
          }
          return {
            kind: "replay",
            status_code: row.status_code,
            response_json: row.response_json,
          } as const;
        }
        this.db
          .prepare("DELETE FROM idempotency_key WHERE scope = ? AND key = ?")
          .run(scope, key);
      }

      this.db
        .prepare(
          `INSERT INTO idempotency_key (
             scope, key, request_hash, status_code, response_json, created_at, expires_at
           ) VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .run(scope, key, requestHash, now, isoAfter(now, ttlMs));

      return { kind: "new" } as const;
    });
  }

  complete(scope: string, key: string, statusCode: number, responseJson: string): void {
    const changes = this.db
      .prepare(
        "UPDATE idempotency_key SET status_code = ?, response_json = ? WHERE scope = ? AND key = ?",
      )
      .run(statusCode, responseJson, scope, key).changes;
    if (Number(changes) === 0) throw new NotFoundError("幂等键", `${scope}/${key}`);
  }

  /** 业务失败需要客户端重试时释放占位；已完成的不删除。 */
  release(scope: string, key: string): void {
    this.db
      .prepare(
        "DELETE FROM idempotency_key WHERE scope = ? AND key = ? AND response_json IS NULL",
      )
      .run(scope, key);
  }

  cleanupExpired(at: string = nowIso()): number {
    return Number(
      this.db.prepare("DELETE FROM idempotency_key WHERE expires_at < ?").run(toIso(at)).changes,
    );
  }
}