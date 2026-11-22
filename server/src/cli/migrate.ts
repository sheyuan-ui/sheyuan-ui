import { resolve } from "node:path";
import { migrate, openDatabase } from "../db/index.ts";

const dbPath = process.argv[2] ?? process.env.HELMET_HUB_DB ?? resolve(import.meta.dirname, "../../data/helmet-hub.db");
const migrationsDir = resolve(import.meta.dirname, "../db/migrations");

const db = openDatabase({ file: dbPath });
try {
  const result = migrate(db, migrationsDir);
  console.log(`数据库：${dbPath}`);
  console.log(`已应用：${result.applied.length ? result.applied.join(", ") : "无"}`);
  console.log(`已存在：${result.skipped.length ? result.skipped.join(", ") : "无"}`);
} finally {
  db.close();
}