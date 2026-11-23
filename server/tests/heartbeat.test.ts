import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { WebSocket, type RawData } from "ws";
import { migrate, openDatabase } from "../src/db/index.ts";
import type { Db } from "../src/db/open.ts";
import { createHelmetServer, type HelmetServer } from "../src/server/index.ts";

const migrationsDir = join(import.meta.dirname, "../src/db/migrations");

interface TestServer {
  db: Db;
  app: HelmetServer;
  baseUrl: string;
  wsUrl: string;
}

async function startServer(
  options: { deviceToken?: string; requireAuth?: boolean } = {},
): Promise<TestServer> {
  const db = openDatabase({ file: ":memory:" });
  migrate(db, migrationsDir);
  const app = createHelmetServer({
    db,
    uploadDir: join(import.meta.dirname, "../data/test-uploads"),
    deviceToken: options.deviceToken,
    requireAuth: options.requireAuth ?? false,
    offlineTimeoutMs: 300,
    // 定时器不自动触发，测试手动调用 sweeper.run()，避免用例之间互相干扰
    heartbeatIntervalMs: 60_000,
  });
  const address = await app.listen(0, "127.0.0.1");
  return {
    db,
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    wsUrl: `ws://127.0.0.1:${address.port}/ws`,
  };
}

async function call(baseUrl: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body, data: body.data as Record<string, unknown> | undefined };
}

function postJson(
  baseUrl: string,
  path: string,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  return call(baseUrl, path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

function heartbeatBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: "SY-Helmet Edge",
    firmware_version: "v1.4.2",
    battery_pct: 86,
    wifi: { connected: true, ssid: "SY-FIELD-A", rssi_dbm: -52 },
    hub_reachable: true,
    cloud_reachable: false,
    task_state: "recording",
    storage_free_bytes: 31_204_147_200,
    state_version: 1,
    ...overrides,
  };
}

function openSocket(wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${wsUrl}?topics=device.status`);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function waitForPresence(
  socket: WebSocket,
  deviceId: string,
  online: boolean,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`等待 ${deviceId} 在场状态消息超时`));
    }, 3_000);
    function onMessage(raw: RawData): void {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (message.topic !== "device.status") return;
      const data = message.data as Record<string, unknown>;
      if (data.device_id !== deviceId || data.online !== online) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(data);
    }
    socket.on("message", onMessage);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("T05 设备注册与心跳", () => {
  let ctx: TestServer;

  before(async () => {
    ctx = await startServer();
  });

  after(async () => {
    await ctx.app.close();
    ctx.db.close();
  });

  test("注册新设备：201，返回配对态与心跳策略", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/register", {
      device_id: "edge-01",
      model: "SY-Helmet Edge",
      firmware_version: "v1.4.2",
    });
    assert.equal(res.status, 201);
    assert.equal(res.data?.device_id, "edge-01");
    assert.equal(res.data?.pair_status, "unpaired");
    assert.equal(res.data?.model, "SY-Helmet Edge");
    assert.equal(res.data?.heartbeat_interval_ms, 60_000);
    assert.equal(res.data?.offline_timeout_ms, 300);
  });

  test("重复注册：200，保留原别名与配对状态", async () => {
    await postJson(ctx.baseUrl, "/api/devices/register", {
      device_id: "edge-02",
      alias: "东栋头盔",
      model: "SY-Helmet Edge",
      firmware_version: "v1.4.2",
    });
    const again = await postJson(ctx.baseUrl, "/api/devices/register", {
      device_id: "edge-02",
      model: "SY-Helmet Edge",
      firmware_version: "v1.4.2",
    });
    assert.equal(again.status, 200);
    assert.equal(again.data?.alias, "东栋头盔");
    assert.equal(again.data?.pair_status, "unpaired");
  });

  test("心跳：accepted=true 且设备状态落库", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/edge-01/heartbeat", heartbeatBody({
      state_version: 3,
      battery_pct: 86,
      task_state: "recording",
    }));
    assert.equal(res.status, 200);
    assert.equal(res.data?.accepted, true);
    assert.equal(res.data?.state_version, 3);

    const status = await call(ctx.baseUrl, "/api/devices/edge-01/status");
    assert.equal(status.status, 200);
    assert.equal(status.data?.battery_pct, 86);
    assert.equal(status.data?.task_state, "recording");
    assert.equal(status.data?.storage_free_bytes, 31_204_147_200);
  });

  test("陈旧 state_version：accepted=false，不覆盖较新状态", async () => {
    await postJson(ctx.baseUrl, "/api/devices/edge-01/heartbeat", heartbeatBody({
      state_version: 5,
      battery_pct: 90,
    }));
    const stale = await postJson(ctx.baseUrl, "/api/devices/edge-01/heartbeat", heartbeatBody({
      state_version: 4,
      battery_pct: 20,
    }));
    assert.equal(stale.status, 200);
    assert.equal(stale.data?.accepted, false);
    assert.equal(stale.data?.state_version, 5);

    const status = await call(ctx.baseUrl, "/api/devices/edge-01/status");
    assert.equal(status.data?.battery_pct, 90);
    assert.equal(status.data?.state_version, 5);
  });

  test("未注册设备直接心跳：自动建档", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/edge-auto/heartbeat", heartbeatBody());
    assert.equal(res.status, 200);
    assert.equal(res.data?.accepted, true);

    const device = await call(ctx.baseUrl, "/api/devices/edge-auto");
    assert.equal(device.status, 200);
    assert.equal(device.data?.pair_status, "unpaired");
  });

  test("心跳省略型号与固件版本：沿用注册档案", async () => {
    await postJson(ctx.baseUrl, "/api/devices/register", {
      device_id: "edge-04",
      model: "SY-Helmet Edge",
      firmware_version: "v1.4.2",
    });
    const body = heartbeatBody();
    delete body.model;
    delete body.firmware_version;
    await postJson(ctx.baseUrl, "/api/devices/edge-04/heartbeat", body);

    const status = await call(ctx.baseUrl, "/api/devices/edge-04/status");
    assert.equal(status.data?.model, "SY-Helmet Edge");
    assert.equal(status.data?.firmware_version, "v1.4.2");
  });

  test("路径 device_id 与请求体不一致：400", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/edge-01/heartbeat", {
      ...heartbeatBody(),
      device_id: "edge-99",
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "INVALID_ARGUMENT");
  });

  test("task_state 非法：400", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/edge-01/heartbeat", heartbeatBody({
      task_state: "running",
    }));
    assert.equal(res.status, 400);
  });

  test("电量越界：400", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/edge-01/heartbeat", heartbeatBody({
      battery_pct: 120,
    }));
    assert.equal(res.status, 400);
  });

  test("超时判定：转离线并推送 device.status，心跳恢复后再推在线", async () => {
    const socket = await openSocket(ctx.wsUrl);
    try {
      const online = waitForPresence(socket, "edge-live", true);
      await postJson(ctx.baseUrl, "/api/devices/edge-live/heartbeat", heartbeatBody());
      await online;

      await sleep(350);
      const offline = waitForPresence(socket, "edge-live", false);
      const events = ctx.app.sweeper.run();
      assert.ok(events.some((event) => event.device_id === "edge-live"));
      const offlineData = await offline;
      assert.equal(typeof offlineData.offline_since, "string");

      const back = waitForPresence(socket, "edge-live", true);
      await postJson(ctx.baseUrl, "/api/devices/edge-live/heartbeat", heartbeatBody({
        state_version: 2,
      }));
      await back;
    } finally {
      socket.close();
    }
  });

  test("未超时的设备不会被判定离线", async () => {
    await postJson(ctx.baseUrl, "/api/devices/edge-fresh/heartbeat", heartbeatBody());
    const events = ctx.app.sweeper.run();
    assert.ok(!events.some((event) => event.device_id === "edge-fresh"));
  });
});

describe("设备令牌鉴权", () => {
  let ctx: TestServer;

  before(async () => {
    ctx = await startServer({ deviceToken: "dev-secret", requireAuth: true });
  });

  after(async () => {
    await ctx.app.close();
    ctx.db.close();
  });

  const register = {
    device_id: "edge-token",
    model: "SY-Helmet Edge",
    firmware_version: "v1.4.2",
  };

  test("缺少设备令牌：401", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/register", register);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "UNAUTHORIZED");
  });

  test("设备令牌错误：401", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/register", register, {
      "x-device-token": "wrong",
    });
    assert.equal(res.status, 401);
  });

  test("设备令牌正确：201，且无需用户登录", async () => {
    const res = await postJson(ctx.baseUrl, "/api/devices/register", register, {
      "x-device-token": "dev-secret",
    });
    assert.equal(res.status, 201);
  });

  test("心跳同样校验设备令牌", async () => {
    const denied = await postJson(ctx.baseUrl, "/api/devices/edge-token/heartbeat", heartbeatBody());
    assert.equal(denied.status, 401);

    const ok = await postJson(
      ctx.baseUrl,
      "/api/devices/edge-token/heartbeat",
      heartbeatBody({ state_version: 2 }),
      { "x-device-token": "dev-secret" },
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.data?.accepted, true);
  });

  test("人账号接口仍按角色矩阵拦截：无令牌 GET 设备列表 401", async () => {
    const res = await call(ctx.baseUrl, "/api/devices");
    assert.equal(res.status, 401);
  });
});
