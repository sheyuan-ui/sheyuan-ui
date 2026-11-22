import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./open.ts";
import { withTransaction } from "./transaction.ts";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

interface AppliedRow {
  name: string;
  checksum: string;
}

const SCHEMA_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    checksum   TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )
`;

/**
 * 按文件名升序执行 migrations 目录下未应用的 .sql。
 * 已执行的迁移文件不可修改：内容变化会中断启动，必须新增迁移。
 */
export function migrate(db: Db, dir: string): MigrationResult {
  db.exec(SCHEMA_TABLE);

  const rows = db
    .prepare("SELECT name, checksum FROM schema_migrations")
    .all() as unknown as AppliedRow[];
  const appliedByName = new Map(rows.map((row) => [row.name, row.checksum]));

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const appliedChecksum = appliedByName.get(name);

    if (appliedChecksum !== undefined) {
      if (appliedChecksum !== checksum) {
        throw new Error(
          `迁移 ${name} 已执行但文件内容已变更，请新增迁移文件而不是修改历史迁移`,
        );
      }
      result.skipped.push(name);
      continue;
    }

    withTransaction(db, () => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)",
      ).run(name, checksum, Date.now());
    });
    result.applied.push(name);
  }

  return result;
}