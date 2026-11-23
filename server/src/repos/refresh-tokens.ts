import { randomUUID } from "node:crypto";
import { nowIso } from "../db/time.ts";
import type { Db } from "../db/open.ts";

export type RevokeReason = "logout" | "rotated" | "reuse_detected" | "disabled";

export interface RefreshTokenRecord {
  token_id: string;
  user_id: string;
  token_hash: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: RevokeReason | null;
  replaced_by: string | null;
  client: string | null;
}

export interface CreateRefreshTokenInput {
  user_id: string;
  token_hash: string;
  expires_at: string;
  client?: string | null;
}

export class RefreshTokenRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  create(input: CreateRefreshTokenInput, at: string = nowIso()): RefreshTokenRecord {
    const record: RefreshTokenRecord = {
      token_id: randomUUID(),
      user_id: input.user_id,
      token_hash: input.token_hash,
      issued_at: at,
      expires_at: input.expires_at,
      revoked_at: null,
      revoked_reason: null,
      replaced_by: null,
      client: input.client ?? null,
    };

    this.db
      .prepare(
        `INSERT INTO auth_refresh_token (
           token_id, user_id, token_hash, issued_at, expires_at,
           revoked_at, revoked_reason, replaced_by, client
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.token_id,
        record.user_id,
        record.token_hash,
        record.issued_at,
        record.expires_at,
        record.revoked_at,
        record.revoked_reason,
        record.replaced_by,
        record.client,
      );

    return record;
  }

  /** 已吊销或已过期的令牌也会返回，供复用检测与审计区分"无效"与"被撤销" */
  findByHash(tokenHash: string): RefreshTokenRecord | null {
    const row = this.db
      .prepare("SELECT * FROM auth_refresh_token WHERE token_hash = ?")
      .get(tokenHash) as unknown as RefreshTokenRecord | undefined;
    return row ?? null;
  }

  revoke(
    tokenId: string,
    reason: RevokeReason,
    replacedBy: string | null = null,
    at: string = nowIso(),
  ): void {
    this.db
      .prepare(
        `UPDATE auth_refresh_token
         SET revoked_at = ?, revoked_reason = ?, replaced_by = ?
         WHERE token_id = ? AND revoked_at IS NULL`,
      )
      .run(at, reason, replacedBy, tokenId);
  }

  /** 复用检测或停用账号时一次吊销该用户全部有效令牌 */
  revokeAllForUser(userId: string, reason: RevokeReason, at: string = nowIso()): number {
    const result = this.db
      .prepare(
        `UPDATE auth_refresh_token
         SET revoked_at = ?, revoked_reason = ?
         WHERE user_id = ? AND revoked_at IS NULL`,
      )
      .run(at, reason, userId);
    return Number(result.changes);
  }

  listByUser(userId: string): RefreshTokenRecord[] {
    return this.db
      .prepare("SELECT * FROM auth_refresh_token WHERE user_id = ? ORDER BY issued_at DESC")
      .all(userId) as unknown as RefreshTokenRecord[];
  }
}
