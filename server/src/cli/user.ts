import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { hashPassword } from "../auth/password.ts";
import { ROLES, isRole } from "../auth/roles.ts";
import { migrate, openDatabase } from "../db/index.ts";
import { createRepositories } from "../repos/index.ts";

/**
 * 账号维护 CLI（T04 的最小运维入口）。
 * 用法：
 *   npm run user -- create <username> <viewer|operator|admin> [--name 显示名] [--password 口令]
 *   npm run user -- list
 * 不传 --password 时生成 12 位随机口令并打印一次，避免口令留在命令历史里。
 */

const dbPath = process.env.HELMET_HUB_DB ?? resolve(import.meta.dirname, "../../data/helmet-hub.db");
const migrationsDir = resolve(import.meta.dirname, "../db/migrations");

const [command, ...rest] = process.argv.slice(2);

function positional(index: number): string | undefined {
  const values = rest.filter((item) => !item.startsWith("--"));
  return values[index];
}

function option(name: string): string | undefined {
  const index = rest.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return rest[index + 1];
}

function usage(): never {
  console.error(
    [
      "用法：",
      "  npm run user -- create <username> <viewer|operator|admin> [--name 显示名] [--password 口令]",
      "  npm run user -- list",
    ].join("\n"),
  );
  process.exit(1);
}

const db = openDatabase({ file: dbPath });
migrate(db, migrationsDir);
const repos = createRepositories(db);

if (command === "create") {
  const username = positional(0);
  const role = positional(1);
  if (username === undefined || role === undefined) usage();
  if (!isRole(role)) {
    console.error(`角色不合法：${role}，可选 ${ROLES.join(" / ")}`);
    process.exit(1);
  }
  if (repos.users.findByUsername(username) !== null) {
    console.error(`账号已存在：${username}`);
    process.exit(1);
  }

  const password = option("password") ?? randomBytes(9).toString("base64url");
  const displayName = option("name") ?? username;
  const user = repos.users.create({
    username,
    display_name: displayName,
    password_hash: hashPassword(password),
    role,
  });

  console.log(`已创建账号：${user.username}（${user.role}），user_id=${user.user_id}`);
  if (option("password") === undefined) {
    console.log(`初始口令（仅显示一次）：${password}`);
  }
} else if (command === "list") {
  const users = repos.users.list();
  if (users.length === 0) {
    console.log("暂无账号");
  }
  for (const user of users) {
    console.log(
      `${user.username}\t${user.role}\t${user.status}\t${user.display_name}\t${
        user.last_login_at ?? "未登录"
      }`,
    );
  }
} else {
  usage();
}

db.close();
