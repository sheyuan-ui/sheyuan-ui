import { randomInt } from "node:crypto";
import { API } from "../../contracts/api.ts";
import type { Repositories } from "../../repos/index.ts";
import { readJsonBody } from "../body.ts";
import type { DeviceSummary } from "../dto.ts";
import { HttpError } from "../http-errors.ts";
import { requestFingerprint, withIdempotency } from "../idempotency.ts";
import { queryInt } from "../query.ts";
import type { Router } from "../router.ts";
import { asObject, int, nullableStr, str } from "../validate.ts";

function summaries(repos: Repositories): DeviceSummary[] {
  const statuses = new Map(repos.devices.listStatuses().map((status) => [status.device_id, status]));
  return repos.devices.listDevices().map((device) => ({
    device_id: device.device_id,
    alias: device.alias,
    pair_status: device.pair_status,
    status: statuses.get(device.device_id) ?? null,
  }));
}

function randomPairCode(repos: Repositories): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = String(randomInt(1000, 10_000));
    if (!repos.devices.hasPairCode(code)) return code;
  }
  throw new HttpError("INTERNAL", "无法生成未占用的配对码");
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

  router.add("POST", API.pairCode, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "devices.pair-code", requestFingerprint(body.raw), () => {
      const input = asObject(body.value);
      const deviceId = str(input, "device_id");
      const provided = input.code === undefined ? undefined : str(input, "code");
      const code = provided ?? randomPairCode(ctx.repos);
      if (!/^\d{4}$/.test(code)) {
        throw new HttpError("INVALID_ARGUMENT", "配对码必须为 4 位数字", { code: "4 digits" });
      }
      const ttl = input.ttl_ms === undefined
        ? 120_000
        : int(input, "ttl_ms", { min: 1_000, max: 600_000 });

      return { status: 201, data: ctx.repos.devices.issuePairCode(deviceId, code, ttl) };
    });
  });

  router.add("POST", API.pair, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "devices.pair", requestFingerprint(body.raw), () => {
      const input = asObject(body.value);
      const code = str(input, "code");
      const ipAddress = nullableStr(input, "ip_address");
      const result = ctx.repos.devices.consumePairCode(code);

      if (!result.ok) {
        if (result.reason === "not_found") {
          throw new HttpError("INVALID_ARGUMENT", "配对码不存在", { reason: result.reason });
        }
        if (result.reason === "expired") {
          throw new HttpError("INVALID_ARGUMENT", "配对码已过期", { reason: result.reason });
        }
        throw new HttpError("CONFLICT", "配对码已使用", { reason: result.reason });
      }

      if (ipAddress !== null) {
        ctx.repos.devices.setPairStatus(result.device_id, "paired", ipAddress);
      }
      ctx.repos.audit.append({
        action: "device.pair",
        target_type: "device",
        target_id: result.device_id,
      });

      return { status: 200, data: { device_id: result.device_id, pair_status: "paired" } };
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