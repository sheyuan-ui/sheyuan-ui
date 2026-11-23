import { randomUUID } from "node:crypto";
import { nowIso } from "../db/time.ts";
import type { Db } from "../db/open.ts";
import type { Role } from "../auth/roles.ts";

export type UserStatus = "active" | "disabled";

export interface UserRecord {
  user_id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface CreateUserInput {
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
}

export class UserRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  create(input: CreateUserInput, at: string = nowIso()): UserRecord {
    const record: UserRecord = {
      user_id: randomUUID(),
      username: input.username,
      display_name: input.display_name,
      password_hash: input.password_hash,
      role: input.role,
      status: "active",
      created_at: at,
      updated_at: at,
      last_login_at: null,
    };

    this.db
      .prepare(
        `INSERT INTO app_user (
           user_id, username, display_name, password_hash, role, status,
           created_at, updated_at, last_login_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.user_id,
        record.username,
        record.display_name,
        record.password_hash,
        record.role,
        record.status,
        record.created_at,
        record.updated_at,
        record.last_login_at,
      );

    return record;
  }

  get(userId: string): UserRecord | null {
    const row = this.db
      .prepare("SELECT * FROM app_user WHERE user_id = ?")
      .get(userId) as unknown as UserRecord | undefined;
    return row ?? null;
  }

  /** 账号列带 COLLATE NOCASE，此处天然不区分大小写 */
  findByUsername(username: string): UserRecord | null {
    const row = this.db
      .prepare("SELECT * FROM app_user WHERE username = ?")
      .get(username) as unknown as UserRecord | undefined;
    return row ?? null;
  }

  list(): UserRecord[] {
    return this.db
      .prepare("SELECT * FROM app_user ORDER BY created_at, user_id")
      .all() as unknown as UserRecord[];
  }

  touchLogin(userId: string, at: string = nowIso()): void {
    this.db
      .prepare("UPDATE app_user SET last_login_at = ?, updated_at = ? WHERE user_id = ?")
      .run(at, at, userId);
  }

  setStatus(userId: string, status: UserStatus, at: string = nowIso()): void {
    this.db
      .prepare("UPDATE app_user SET status = ?, updated_at = ? WHERE user_id = ?")
      .run(status, at, userId);
  }

  setPassword(userId: string, passwordHash: string, at: string = nowIso()): void {
    this.db
      .prepare("UPDATE app_user SET password_hash = ?, updated_at = ? WHERE user_id = ?")
      .run(passwordHash, at, userId);
  }
}
