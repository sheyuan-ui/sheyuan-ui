import { resolve } from "node:path";
import { migrate, openDatabase } from "../db/index.ts";
import { createRepositories } from "../repos/index.ts";
import { DEMO_IDS, seedDemo } from "../seed/demo.ts";

const dbPath = process.argv[2] ?? process.env.HELMET_HUB_DB ?? resolve(import.meta.dirname, "../../data/helmet-hub.db");
const migrationsDir = resolve(import.meta.dirname, "../db/migrations");

const db = openDatabase({ file: dbPath });
try {
  migrate(db, migrationsDir);
  seedDemo(createRepositories(db));
  console.log(`已写入演示数据：${dbPath}`);
  console.log(`设备 ${DEMO_IDS.device} · 任务 ${DEMO_IDS.job} · 会话 ${DEMO_IDS.session}`);
} finally {
  db.close();
}