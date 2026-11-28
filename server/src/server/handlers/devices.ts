import {
  API,
  WS_TOPICS,
} from "../../contracts/api.ts";
import type { DeviceStatus, DeviceTaskState, WifiStatus } from "../../contracts/types.ts";
import { nowIso } from "../../db/time.ts";
import { deriveDeviceState } from "../../device/state.ts";
import type { Repositories } from "../../repos/index.ts";
import { readJsonBody } from "../body.ts";
import type { DeviceSummary } from "../dto.ts";
import { HttpError } from "../http-errors.ts";
import { requestFingerprint, withIdempotency } from "../idempotency.ts";
import { queryInt } from "../query.ts";
import type { Router } from "../router.ts";
import { asObject, bool, enumOf, int, isoStr, nullableStr, str } from "../validate.ts";

function summaries(repos: Repositories, now: string = nowIso()): DeviceSummary[] {
  const statuses = new Map(repos.devices.listStatuses().map((status) => [status.device_id, status]));
  const codes = new Map(
    repos.devices
      .listDeviceCodes()
      .filter((item) => item.device_id !== null)
      .map((item) => [item.device_id as string, item.code]),
  );
  return repos.devices.listDevices().map((device) => {
    const status = statuses.get(device.device_id) ?? null;
    return {
      device_id: device.device_id,
      alias: device.alias,
      pair_status: device.pair_status,
      device_code: codes.get(device.device_id) ?? null,
      status,
      runtime: deriveDeviceState({
        status,
        presence: repos.presence.get(device.device_id),
        now,
      }),
    };
  });
}

const DEVICE_TASK_STATES: readonly DeviceTaskState[] = [
  "idle",
  "starting",
  "recording",
  "paused",
  "stopping",
  "error",
];

/** 契约里未知为 null，不得用 0 顶替 */
function optionalNumber(input: Record<string, unknown>, field: string): number | null {
  const value = input[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 必须为数字或 null`);
  }
  return value;
}

function readWifi(input: Record<string, unknown>): WifiStatus {
  const wifi = asObject(input.wifi ?? {}, "wifi");
  return {
    connected: bool(wifi, "connected"),
    ssid: nullableStr(wifi, "ssid"),
    rssi_dbm: optionalNumber(wifi, "rssi_dbm"),
  };
}

export function registerDeviceRoutes(router: Router): void {
  router.add("GET", API.devices, (ctx) => ({
    status: 200,
    data: summaries(ctx.repos),
  }));

  router.add("GET", API.device(":id"), (ctx) => {
    const deviceId = ctx.params.id as string;
    const device = summaries(ctx.repos).find((item) => item.device_id === deviceId);
    if (!device) throw new HttpError("NOT_FOUND", `设备不存在：${deviceId}`);
    return { status: 200, data: device };
  });

  router.add("GET", API.deviceStatus(":id"), (ctx) => {
    const deviceId = ctx.params.id as string;
    if (!ctx.repos.devices.getDevice(deviceId)) {
      throw new HttpError("NOT_FOUND", `设备不存在：${deviceId}`);
    }
    const status = ctx.repos.devices.getStatus(deviceId);
    if (!status) throw new HttpError("NOT_FOUND", `设备尚未上报状态：${deviceId}`);
    return { status: 200, data: status };
  });

  router.add("GET", API.deviceSessions(":id"), (ctx) => {
    const deviceId = ctx.params.id as string;
    if (!ctx.repos.devices.getDevice(deviceId)) {
      throw new HttpError("NOT_FOUND", `设备不存在：${deviceId}`);
    }
    const limit = queryInt(ctx.url, "limit", { min: 1, max: 200 }) ?? 50;
    return { status: 200, data: ctx.repos.sessions.listByDevice(deviceId, limit) };
  });

  /* -------- 设备侧：注册与心跳（设备令牌鉴权，不走人账号角色矩阵） -------- */

  router.add("POST", API.deviceRegister, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    const input = asObject(body.value);
    const deviceId = str(input, "device_id");
    const existed = ctx.repos.devices.getDevice(deviceId) !== null;

    const device = ctx.repos.devices.register(deviceId, {
      alias: nullableStr(input, "alias"),
      model: str(input, "model"),
      firmwareVersion: str(input, "firmware_version"),
    });
    const { presence, cameOnline } = ctx.repos.presence.markSeen(deviceId);
    if (cameOnline) {
      const runtime = deriveDeviceState({
        status: ctx.repos.devices.getStatus(deviceId),
        presence,
      });
      ctx.hub.publish(WS_TOPICS.deviceStatus, {
        device_id: deviceId,
        online: true,
        last_seen: presence.last_seen,
        state: runtime.state,
        state_reason: runtime.reason,
      });
    }
    ctx.repos.audit.append({
      actor_id: null,
      actor_role: null,
      action: "device.register",
      target_type: "device",
      target_id: deviceId,
    });

    return {
      status: existed ? 200 : 201,
      data: {
        device_id: device.device_id,
        alias: device.alias,
        pair_status: device.pair_status,
        model: device.model,
        firmware_version: device.firmware_version,
        server_time: nowIso(),
        heartbeat_interval_ms: ctx.devicePolicy.heartbeatIntervalMs,
        offline_timeout_ms: ctx.devicePolicy.offlineTimeoutMs,
      },
    };
  });

  router.add("POST", API.deviceHeartbeat(":id"), async (ctx) => {
    const deviceId = ctx.params.id as string;
    const body = await readJsonBody(ctx.req);
    const input = asObject(body.value);
    if (input.device_id !== undefined && input.device_id !== deviceId) {
      throw new HttpError("INVALID_ARGUMENT", "路径中的 device_id 与请求体不一致");
    }

    const device = ctx.repos.devices.getDevice(deviceId);
    const previous = ctx.repos.devices.getStatus(deviceId);
    const status: DeviceStatus = {
      device_id: deviceId,
      // 注册时已上报档案；未注册设备直接心跳时允许省略，先落 "unknown"
      model: input.model === undefined
        ? (device?.model ?? previous?.model ?? "unknown")
        : str(input, "model"),
      firmware_version: input.firmware_version === undefined
        ? (device?.firmware_version ?? previous?.firmware_version ?? "unknown")
        : str(input, "firmware_version"),
      battery_pct: optionalNumber(input, "battery_pct"),
      wifi: readWifi(input),
      hub_reachable: bool(input, "hub_reachable"),
      cloud_reachable: bool(input, "cloud_reachable"),
      task_state: enumOf(input, "task_state", DEVICE_TASK_STATES),
      storage_free_bytes: int(input, "storage_free_bytes", { min: 0 }),
      last_seen: input.last_seen === undefined ? nowIso() : isoStr(input, "last_seen"),
      state_version: int(input, "state_version", { min: 0 }),
    };
    if (status.battery_pct !== null && (status.battery_pct < 0 || status.battery_pct > 100)) {
      throw new HttpError("INVALID_ARGUMENT", "battery_pct 必须在 0–100 之间", {
        battery_pct: "0..100",
      });
    }

    // 陈旧 state_version 不写库，但仍算设备活着：在场状态始终刷新
    const accepted = ctx.repos.devices.upsertStatus(status);
    const { presence, cameOnline } = ctx.repos.presence.markSeen(deviceId);
    const current = ctx.repos.devices.getStatus(deviceId);
    if (cameOnline) {
      const runtime = deriveDeviceState({ status: current, presence });
      ctx.hub.publish(WS_TOPICS.deviceStatus, {
        device_id: deviceId,
        online: true,
        last_seen: presence.last_seen,
        task_state: current?.task_state ?? status.task_state,
        state: runtime.state,
        state_reason: runtime.reason,
      });
    }

    return {
      status: 200,
      data: {
        device_id: deviceId,
        accepted,
        state_version: current?.state_version ?? status.state_version,
        task_state: current?.task_state ?? status.task_state,
        server_time: nowIso(),
        heartbeat_interval_ms: ctx.devicePolicy.heartbeatIntervalMs,
        offline_timeout_ms: ctx.devicePolicy.offlineTimeoutMs,
      },
    };
  });

  router.add("POST", API.pair, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "devices.pair", requestFingerprint(body.raw), () => {
      const input = asObject(body.value);
      const deviceCode = str(input, "device_code");
      const deviceId = input.device_id === undefined ? null : str(input, "device_id");
      const ipAddress = nullableStr(input, "ip_address");
      const result = ctx.repos.devices.pairByDeviceCode(deviceCode, deviceId, ipAddress);

      if (!result.ok) {
        if (result.reason === "not_found") {
          throw new HttpError("NOT_FOUND", "设备码不在库中", { reason: result.reason });
        }
        if (result.reason === "unbound") {
          throw new HttpError("INVALID_ARGUMENT", "设备码未绑定设备，无法配对", {
            reason: result.reason,
          });
        }
        if (result.reason === "device_not_found") {
          throw new HttpError("NOT_FOUND", "设备尚未注册", { reason: result.reason });
        }
        throw new HttpError("CONFLICT", "设备码与设备不匹配", { reason: result.reason });
      }

      ctx.repos.audit.append({
        actor_id: ctx.auth?.user_id ?? null,
        actor_role: ctx.auth?.role ?? null,
        action: "device.pair",
        target_type: "device",
        target_id: result.device_id,
      });

      return {
        status: 200,
        data: {
          device_id: result.device_id,
          pair_status: "paired",
          device_code: result.device_code,
        },
      };
    });
  });

  router.add("POST", API.previewOffer(":id"), (ctx) => {
    ctx.req.resume();
    throw new HttpError(
      "DEVICE_UNREACHABLE",
      "预览转发通道未接入（WEB-03/06），当前无法协商 WebRTC",
    );
  });
}