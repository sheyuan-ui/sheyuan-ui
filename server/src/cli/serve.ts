import { resolve } from "node:path";
import { migrate, openDatabase } from "../db/index.ts";
import { createHelmetServer } from "../server/index.ts";

const dbPath = process.env.HELMET_HUB_DB ?? resolve(import.meta.dirname, "../../data/helmet-hub.db");
const uploadDir =
  process.env.HELMET_HUB_UPLOAD_DIR ?? resolve(import.meta.dirname, "../../data/uploads");
const migrationsDir = resolve(import.meta.dirname, "../db/migrations");
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error(`PORT 不合法：${process.env.PORT ?? ""}`);
}

const db = openDatabase({ file: dbPath });
migrate(db, migrationsDir);

const app = createHelmetServer({
  db,
  uploadDir,
  token: process.env.HELMET_HUB_TOKEN,
  logger: (message) => console.error(message),
});
const address = await app.listen(port, host);

console.log(`管理服务已启动：http://${host}:${address.port}`);
console.log(`WebSocket：ws://${host}:${address.port}/ws`);
console.log(`数据库：${dbPath}`);
console.log(`上传目录：${uploadDir}`);

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.log(`收到 ${signal}，正在关闭…`);
  await app.close();
  db.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));