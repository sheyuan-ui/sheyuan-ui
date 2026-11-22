import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

export interface OpenOptions {
  /** ":memory:" 用于测试 */
  file: string;
  /** 只读打开时不写 WAL，避免意外建目录 */
  readOnly?: boolean;
}

export function openDatabase({ file, readOnly = false }: OpenOptions): Db {
  if (file !== ":memory:" && !readOnly) {
    mkdirSync(dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file, { readOnly });

  if (file !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);

  return db;
}