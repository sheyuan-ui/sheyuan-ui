import { randomUUID } from "node:crypto";
import type { Db } from "../db/open.ts";
import { nowIso } from "../db/time.ts";

export type ActorRole = "viewer" | "operator" | "admin";

export interface AuditEntry {
  audit_id: string;
  actor_id: string | null;
  actor_role: ActorRole | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail_json: string | null;
  created_at: string;
}

export interface AuditInput {
  actor_id?: string | null;
  actor_role?: ActorRole | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  detail?: unknown;
}

export class AuditRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  append(input: AuditInput, at: string = nowIso()): AuditEntry {
    const entry: AuditEntry = {
      audit_id: randomUUID(),
      actor_id: input.actor_id ?? null,
      actor_role: input.actor_role ?? null,
      action: input.action,
      target_type: input.target_type,
      target_id: input.target_id ?? null,
      detail_json: input.detail === undefined ? null : JSON.stringify(input.detail),
      created_at: at,
    };

    this.db
      .prepare(
        `INSERT INTO audit_log (
           audit_id, actor_id, actor_role, action, target_type, target_id, detail_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.audit_id,
        entry.actor_id,
        entry.actor_role,
        entry.action,
        entry.target_type,
        entry.target_id,
        entry.detail_json,
        entry.created_at,
      );

    return entry;
  }

  list(limit = 100): AuditEntry[] {
    return this.db
      .prepare("SELECT * FROM audit_log ORDER BY created_at DESC, audit_id LIMIT ?")
      .all(limit) as unknown as AuditEntry[];
  }

  listByTarget(targetType: string, targetId: string): AuditEntry[] {
    return this.db
      .prepare(
        `SELECT * FROM audit_log
         WHERE target_type = ? AND target_id = ?
         ORDER BY created_at, audit_id`,
      )
      .all(targetType, targetId) as unknown as AuditEntry[];
  }
}