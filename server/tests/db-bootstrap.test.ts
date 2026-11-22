import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { migrate, openDatabase, withTransaction } from "../src/db/index.ts";
import type { Db } from "../src/db/index.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "helmet-hub-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function memoryDb(): Db {
  return openDatabase({ file: ":memory:" });
}

function writeMigration(name: string, sql: string): void {
  writeFileSync(join(dir, name), sql, "utf8");
}

test("打开数据库时启用外键与忙等待", () => {
  const db = memoryDb();
  try {
    assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
    assert.equal(db.prepare("PRAGMA busy_timeout").get()?.timeout, 5000);
  } finally {
    db.close();
  }
});

test("按文件名顺序应用迁移，重复执行幂等", () => {
  writeMigration("002_b.sql", "CREATE TABLE b (id INTEGER PRIMARY KEY);");
  writeMigration("001_a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY);");
  const db = memoryDb();
  try {
    assert.deepEqual(migrate(db, dir), { applied: ["001_a.sql", "002_b.sql"], skipped: [] });
    assert.deepEqual(migrate(db, dir), { applied: [], skipped: ["001_a.sql", "002_b.sql"] });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    assert.deepEqual(tables, ["a", "b", "schema_migrations"]);
  } finally {
    db.close();
  }
});

test("已应用的迁移文件被修改时拒绝启动", () => {
  writeMigration("001_a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY);");
  const db = memoryDb();
  try {
    migrate(db, dir);
    writeMigration("001_a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY, x TEXT);");
    assert.throws(() => migrate(db, dir), /内容已变更/);
  } finally {
    db.close();
  }
});

test("迁移失败时整体回滚且不记录版本", () => {
  writeMigration(
    "001_bad.sql",
    `CREATE TABLE half (id INTEGER PRIMARY KEY);
     INSERT INTO half (id) VALUES (1);
     SELECT * FROM table_that_does_not_exist;`,
  );
  const db = memoryDb();
  try {
    assert.throws(() => migrate(db, dir), /no such table/);
    const remaining = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'half'")
      .all();
    assert.equal(remaining.length, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n,
      0,
    );

    writeMigration("001_bad.sql", "CREATE TABLE fixed (id INTEGER PRIMARY KEY);");
    assert.deepEqual(migrate(db, dir).applied, ["001_bad.sql"]);
  } finally {
    db.close();
  }
});

test("嵌套事务使用 SAVEPOINT，只回滚内层", () => {
  writeMigration("001_a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY);");
  const db = memoryDb();
  try {
    migrate(db, dir);
    withTransaction(db, () => {
      db.prepare("INSERT INTO a (id) VALUES (1)").run();
      try {
        withTransaction(db, () => {
          db.prepare("INSERT INTO a (id) VALUES (1)").run();
        });
      } catch {
        // 主键冲突只回滚内层
      }
    });
    const ids = db.prepare("SELECT id FROM a").all().map((row) => (row as { id: number }).id);
    assert.deepEqual(ids, [1]);
  } finally {
    db.close();
  }
});