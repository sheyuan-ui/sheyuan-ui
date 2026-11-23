import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { signAccessToken } from "../src/auth/jwt.ts";
import { hashPassword } from "../src/auth/password.ts";
import { migrate, openDatabase } from "../src/db/index.ts";
import type { Db } from "../src/db/open.ts";
import { createRepositories, type Repositories } from "../src/repos/index.ts";
import type { AuditEntry } from "../src/repos/index.ts";
import { createHelmetServer, type HelmetServer } from "../src/server/index.ts";

/**
 * T04 验收：登录、短期 JWT、三角色中间件、审计中间件。
 * 这里用 requireAuth: true 的独立实例，验证强制鉴权链路；
 * 既有 api.test.ts 保持 requireAuth 关闭，验证免登录演示路径不受影响。
 */

const JWT_SECRET = "unit-test-secret-0123456789abcdef";
const PASSWORD = "Passw0rd!";
const migrationsDir = join(import.meta.dirname, "../src/db/migrations");

let db: Db;
let repos: Repositories;
let app: HelmetServer;
let baseUrl: string;
let uploadDir: string;

interface TokenPair {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: { user_id: string; username: string; display_name: string; role: string };
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

function headers(token?: string): Record<string, string> {
  const base: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) base.authorization = `Bearer ${token}`;
  return base;
}

function postJson(
  path: string,
  payload: unknown,
  options: { token?: string; idempotencyKey?: string } = {},
) {
  const base = headers(options.token);
  if (options.idempotencyKey !== undefined) {
    base["idempotency-key"] = options.idempotencyKey;
  }
  return call(path, { method: "POST", headers: base, body: JSON.stringify(payload) });
}

async function login(username: string, password = PASSWORD): Promise<TokenPair> {
  const { status, body } = await postJson("/api/auth/login", { username, password });
  assert.equal(status, 200, `登录失败：${JSON.stringify(body)}`);
  return body.data as TokenPair;
}

function auditsOf(action: string): AuditEntry[] {
  return repos.audit.list(500).filter((entry) => entry.action === action);
}

function createUser(username: string, role: "viewer" | "operator" | "admin") {
  return repos.users.create({
    username,
    display_name: `${username}-name`,
    password_hash: hashPassword(PASSWORD),
    role,
  });
}

before(async () => {
  db = openDatabase({ file: ":memory:" });
  migrate(db, migrationsDir);
  repos = createRepositories(db);

  createUser("admin-a", "admin");
  createUser("op-a", "operator");
  createUser("viewer-a", "viewer");
  createUser("op-b", "operator");
  createUser("temp-a", "viewer");

  uploadDir = await mkdtemp(join(tmpdir(), "helmet-hub-auth-"));
  app = createHelmetServer({
    db,
    uploadDir,
    requireAuth: true,
    jwtSecret: JWT_SECRET,
    accessTokenTtlSeconds: 900,
    logger: () => {},
  });
  const address = await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app.close();
  db.close();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("登录与短期 JWT", () => {
  test("登录返回 15 分钟访问令牌与刷新令牌，角色随令牌下发", async () => {
    const pair = await login("admin-a");
    assert.equal(pair.token_type, "Bearer");
    assert.equal(pair.expires_in, 900);
    assert.equal(pair.refresh_expires_in, 30 * 24 * 60 * 60);
    assert.equal(pair.user.role, "admin");
    assert.ok(pair.access_token.split(".").length === 3, "访问令牌应为 JWT 三段式");
    assert.ok(pair.refresh_token.length > 0);
  });

  test("令牌可用后 /api/auth/me 回显当前身份", async () => {
    const pair = await login("viewer-a");
    const { status, body } = await call("/api/auth/me", { headers: headers(pair.access_token) });
    assert.equal(status, 200);
    const user = body.data as { username: string; role: string };
    assert.equal(user.username, "viewer-a");
    assert.equal(user.role, "viewer");
  });

  test("过期访问令牌被拒", async () => {
    const viewer = repos.users.findByUsername("viewer-a");
    assert.ok(viewer);
    const expired = signAccessToken(
      { user_id: viewer.user_id, role: viewer.role, display_name: viewer.display_name },
      { secret: JWT_SECRET, issuer: "helmet-hub", ttlSeconds: -10 },
    );
    const { status, body } = await call("/api/auth/me", {
      headers: headers(expired.token),
    });
    assert.equal(status, 401);
    assert.equal(body.code, "UNAUTHORIZED");
  });

  test("口令错误与账号不存在返回同一提示，并写登录失败审计", async () => {
    const wrong = await postJson("/api/auth/login", { username: "admin-a", password: "bad" });
    const missing = await postJson("/api/auth/login", {
      username: "nobody-here",
      password: PASSWORD,
    });

    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.equal(wrong.body.message, missing.body.message);

    const failed = auditsOf("auth.login_failed").map((entry) => entry.target_id);
    assert.ok(failed.includes("admin-a"));
    assert.ok(failed.includes("nobody-here"));
  });

  test("停用账号立即失效：令牌被拒、登录被拒", async () => {
    const pair = await login("temp-a");
    const temp = repos.users.findByUsername("temp-a");
    assert.ok(temp);
    repos.users.setStatus(temp.user_id, "disabled");

    const me = await call("/api/auth/me", { headers: headers(pair.access_token) });
    assert.equal(me.status, 401);

    const relogin = await postJson("/api/auth/login", { username: "temp-a", password: PASSWORD });
    assert.equal(relogin.status, 403);
    assert.equal(relogin.body.code, "FORBIDDEN");
  });
});

describe("三角色中间件", () => {
  test("未认证访问业务接口返回 401，并写入 auth.unauthenticated", async () => {
    const before = auditsOf("auth.unauthenticated").length;
    const { status, body } = await call("/api/devices");
    assert.equal(status, 401);
    assert.equal(body.code, "UNAUTHORIZED");
    assert.equal(auditsOf("auth.unauthenticated").length, before + 1);
  });

  test("viewer 可读不可写，越权返回 403 并记录角色", async () => {
    const viewer = await login("viewer-a");

    const read = await call("/api/devices", { headers: headers(viewer.access_token) });
    assert.equal(read.status, 200);

    const write = await postJson(
      "/api/devices/pair-code",
      { device_id: "edge-auth-viewer" },
      { token: viewer.access_token, idempotencyKey: "viewer-write-1" },
    );
    assert.equal(write.status, 403);
    assert.equal(write.body.code, "FORBIDDEN");

    const forbidden = auditsOf("auth.forbidden").find(
      (entry) => entry.target_id === "POST /api/devices/pair-code",
    );
    assert.ok(forbidden);
    assert.equal(forbidden.actor_id, viewer.user.user_id);
    assert.equal(forbidden.actor_role, "viewer");
  });

  test("operator 可写，业务审计继承验签身份", async () => {
    const operator = await login("op-a");

    const issued = await postJson(
      "/api/devices/pair-code",
      { device_id: "edge-auth-op" },
      { token: operator.access_token, idempotencyKey: "op-pair-code-1" },
    );
    assert.equal(issued.status, 201);
    const code = (issued.body.data as { code: string }).code;

    const paired = await postJson(
      "/api/devices/pair",
      { code, ip_address: "192.168.1.20" },
      { token: operator.access_token, idempotencyKey: "op-pair-1" },
    );
    assert.equal(paired.status, 200);

    const entry = auditsOf("device.pair").find((item) => item.target_id === "edge-auth-op");
    assert.ok(entry);
    assert.equal(entry.actor_id, operator.user.user_id);
    assert.equal(entry.actor_role, "operator");
  });

  test("审计流水仅 admin 可查", async () => {
    const operator = await login("op-a");
    const admin = await login("admin-a");

    const denied = await call("/api/audit", { headers: headers(operator.access_token) });
    assert.equal(denied.status, 403);

    const allowed = await call("/api/audit?limit=5", { headers: headers(admin.access_token) });
    assert.equal(allowed.status, 200);
    assert.ok(Array.isArray(allowed.body.data));
    assert.ok((allowed.body.data as AuditEntry[]).length <= 5);
  });
});

describe("刷新令牌轮换与注销", () => {
  test("刷新一次后旧令牌失效；旧令牌复用触发整账号吊销", async () => {
    const first = await login("op-b");

    const rotated = await postJson("/api/auth/refresh", { refresh_token: first.refresh_token });
    assert.equal(rotated.status, 200);
    const second = rotated.body.data as TokenPair;
    assert.notEqual(second.refresh_token, first.refresh_token);

    const reuse = await postJson("/api/auth/refresh", { refresh_token: first.refresh_token });
    assert.equal(reuse.status, 401);
    assert.ok(auditsOf("auth.refresh_reuse").length > 0);

    // 复用检测后该账号所有令牌都已吊销，新令牌同样失效
    const afterReuse = await postJson("/api/auth/refresh", { refresh_token: second.refresh_token });
    assert.equal(afterReuse.status, 401);
  });

  test("登出后刷新令牌不可再用", async () => {
    const pair = await login("op-b");
    const out = await postJson(
      "/api/auth/logout",
      { refresh_token: pair.refresh_token },
      { token: pair.access_token },
    );
    assert.equal(out.status, 200);
    assert.equal((out.body.data as { revoked: boolean }).revoked, true);

    const refresh = await postJson("/api/auth/refresh", { refresh_token: pair.refresh_token });
    assert.equal(refresh.status, 401);
    assert.ok(auditsOf("auth.logout").length > 0);
  });

  test("伪造刷新令牌返回 401，不产生账号副作用", async () => {
    const pair = await login("viewer-a");
    const forged = await postJson("/api/auth/refresh", { refresh_token: "not-a-real-token" });
    assert.equal(forged.status, 401);

    const me = await call("/api/auth/me", { headers: headers(pair.access_token) });
    assert.equal(me.status, 200);
  });
});
