import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { WebSocket, type RawData } from "ws";
import type { DeviceStatus } from "../src/contracts/types.ts";
import { migrate, openDatabase } from "../src/db/index.ts";
import type { Db } from "../src/db/open.ts";
import { deriveDeviceState } from "../src/device/state.ts";
import type { PresenceRecord } from "../src/repos/presence.ts";
import { createHelmetServer, type HelmetServer } from "../src/server/index.ts";

const migrationsDir = join(import.meta.dirname, "../src/db/migrations");

function presence(overrides: Partial<PresenceRecord> = {}): PresenceRecord {
  return {
    device_id: "edge-01",
    online: true,
    last_seen: "2026-11-26T10:00:00.000Z",
    offline_since: null,
    updated_at: "2026-11-26T10:00:00.000Z",
    ...overrides,
  };
}

function status(overrides: Partial<DeviceStatus> = {}): DeviceStatus {
  return {
    device_id: "edge-01",
    model: "SY-Helmet Edge",
    firmware_version: "v1.4.2",
    battery_pct: null,
    wifi: { connected: true, ssid: "SY-FIELD-A", rssi_dbm: -52 },
    hub_reachable: true,
    cloud_reachable: false,
    task_state: "idle",
    storage_free_bytes: 31_204_147_200,
    last_seen: "2026-11-26T10:00:00.000Z",
    state_version: 1,
    ...overrides,
  };
}

describe("T07 四态派生（纯函数）", () => {
  test("从未收到心跳：离线，原因 never_seen", () => {
    const view = deriveDeviceState({ status: null, presence: null });
    assert.equal(view.state, "offline");
    assert.equal(view.reason, "never_seen");
    assert.equal(view.online, false);
    assert.equal(view.offline_ms, null);
  });

  test("心跳超时：离线并算出已离线时长", () => {
    const view = deriveDeviceState({
      status: status({ task_state: "recording" }),
      presence: presence({ online: false, offline_since: "2026-11-26T10:00:00.000Z" }),
      now: "2026-11-26T10:00:05.000Z",
    });
    assert.equal(view.state, "offline");
    assert.equal(view.reason, "heartbeat_timeout");
    assert.equal(view.offline_ms, 5_000);
    assert.equal(view.offline_since, "2026-11-26T10:00:00.000Z");
  });

  test("在线录制中：运行中", () => {
    const view = deriveDeviceState({
      status: status({ task_state: "recording" }),
      presence: presence(),
    });
    assert.equal(view.state, "running");
    assert.equal(view.reason, "task_active");
    assert.equal(view.online, true);
    assert.equal(view.offline_ms, null);
  });

  test("暂停也归为运行中（任务未结束）", () => {
    for (const taskState of ["starting", "paused", "stopping"] as const) {
      const view = deriveDeviceState({ status: status({ task_state: taskState }), presence: presence() });
      assert.equal(view.state, "running", `${taskState} 应为运行中`);
    }
  });

  test("在线且空闲：在线", () => {
    const view = deriveDeviceState({ status: status({ task_state: "idle" }), presence: presence() });
    assert.equal(view.state, "online");
    assert.equal(view.reason, "idle");
  });

  test("设备上报 error：故障", () => {
    const view = deriveDeviceState({ status: status({ task_state: "error" }), presence: presence() });
    assert.equal(view.state, "fault");
    assert.equal(view.reason, "device_error");
  });

  test("设备自报连不上管理服务：故障", () => {
    const view = deriveDeviceState({
      status: status({ hub_reachable: false }),
      presence: presence(),
    });
    assert.equal(view.state, "fault");
    assert.equal(view.reason, "hub_unreachable");
  });

  test("离线优先于故障：不用过期快照报故障", () => {
    const view = deriveDeviceState({
      status: status({ task_state: "error" }),
      presence: presence({ online: false, offline_since: "2026-11-26T10:00:00.000Z" }),
      now: "2026-11-26T10:01:00.000Z",
    });
    assert.equal(view.state, "offline");
  });

  test("刚注册、尚无状态快照：在线", () => {
    const view = deriveDeviceState({ status: null, presence: presence() });
    assert.equal(view.state, "online");
    assert.equal(view.reason, "idle");
  });
});

interface TestServer {
  db: Db;
  app: HelmetServer;
  baseUrl: string;
  wsUrl: string;
}

async function startServer(): Promise<TestServer> {
  const db = openDatabase({ file: ":memory:" });
  migrate(db, migrationsDir);
  const app = createHelmetServer({
    db,
    uploadDir: join(import.meta.dirname, "../data/test-uploads"),
    requireAuth: false,
    offlineTimeoutMs: 300,
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

async function call(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, data: body.data as Record<string, unknown> | undefined };
}

function postJson(baseUrl: string, path: string, payload: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForOffline(socket: WebSocket, deviceId: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`等待 ${deviceId} 离线消息超时`));
    }, 3_000);
    function onMessage(raw: RawData): void {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (message.topic !== "device.status") return;
      const data = message.data as Record<string, unknown>;
      if (data.device_id !== deviceId || data.online !== false) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(data);
    }
    socket.on("message", onMessage);
  });
}

describe("T07 四态接口与推送", () => {
  let ctx: TestServer;

  before(async () => {
    ctx = await startServer();
  });

  after(async () => {
    await ctx.app.close();
    ctx.db.close();
  });

  test("心跳录制中：总览与详情返回运行中", async () => {
    await postJson(ctx.baseUrl, "/api/devices/register", {
      device_id: "edge-state-01",
      model: "SY-Helmet Edge",
      firmware_version: "v1.4.2",
    });
    await postJson(ctx.baseUrl, "/api/devices/edge-state-01/heartbeat", heartbeatBody());

    const detail = await call(ctx.baseUrl, "/api/devices/edge-state-01");
    const runtime = detail.data?.runtime as Record<string, unknown>;
    assert.equal(runtime.state, "running");
    assert.equal(runtime.online, true);
    assert.equal(runtime.reason, "task_active");
    assert.equal(runtime.offline_since, null);

    const list = await call(ctx.baseUrl, "/api/devices");
    const rows = list.data as unknown as Array<Record<string, unknown>>;
    const row = rows.find((item) => item.device_id === "edge-state-01");
    const listed = row?.runtime as Record<string, unknown>;
    assert.equal(listed.state, "running");
  });

  test("设备上报 error：状态为故障", async () => {
    await postJson(ctx.baseUrl, "/api/devices/edge-state-02/heartbeat", heartbeatBody({
      task_state: "error",
    }));
    const detail = await call(ctx.baseUrl, "/api/devices/edge-state-02");
    const runtime = detail.data?.runtime as Record<string, unknown>;
    assert.equal(runtime.state, "fault");
    assert.equal(runtime.reason, "device_error");
  });

  test("心跳超时：转离线并带离线标注，恢复后回到在线", async () => {
    const socket = new WebSocket(`${ctx.wsUrl}?topics=device.status`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });

    try {
      await postJson(ctx.baseUrl, "/api/devices/edge-state-03/heartbeat", heartbeatBody({
        task_state: "idle",
      }));
      const onlineDetail = await call(ctx.baseUrl, "/api/devices/edge-state-03");
      assert.equal((onlineDetail.data?.runtime as Record<string, unknown>).state, "online");

      await sleep(350);
      const offlineMessage = waitForOffline(socket, "edge-state-03");
      ctx.app.sweeper.run();
      const pushed = await offlineMessage;
      assert.equal(pushed.state, "offline");
      assert.equal(pushed.state_reason, "heartbeat_timeout");

      const detail = await call(ctx.baseUrl, "/api/devices/edge-state-03");
      const runtime = detail.data?.runtime as Record<string, unknown>;
      assert.equal(runtime.state, "offline");
      assert.equal(runtime.reason, "heartbeat_timeout");
      assert.equal(typeof runtime.offline_since, "string");
      assert.ok((runtime.offline_ms as number) >= 0);

      await postJson(ctx.baseUrl, "/api/devices/edge-state-03/heartbeat", heartbeatBody({
        state_version: 2,
        task_state: "idle",
      }));
      const back = await call(ctx.baseUrl, "/api/devices/edge-state-03");
      const backRuntime = back.data?.runtime as Record<string, unknown>;
      assert.equal(backRuntime.state, "online");
      assert.equal(backRuntime.offline_since, null);
    } finally {
      socket.close();
    }
  });

  test("刚注册、尚无状态快照：判为在线", async () => {
    await postJson(ctx.baseUrl, "/api/devices/register", {
      device_id: "edge-state-04",
      model: "SY-Helmet Edge",
      firmware_version: "v1.4.2",
    });
    // 注册即 markSeen，因此设备在线但没有状态快照
    const detail = await call(ctx.baseUrl, "/api/devices/edge-state-04");
    const runtime = detail.data?.runtime as Record<string, unknown>;
    assert.equal(runtime.state, "online");
    assert.equal(runtime.online, true);
  });
});
