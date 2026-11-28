import { API } from "../../contracts/api.ts";
import { readJsonBody } from "../body.ts";
import { HttpError } from "../http-errors.ts";
import { requestFingerprint, withIdempotency } from "../idempotency.ts";
import type { Router } from "../router.ts";
import { asObject, str } from "../validate.ts";

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{5,}$/;

/** 设备码库：管理员登记白名单，配对时按码校验。 */
export function registerDeviceCodeRoutes(router: Router): void {
  router.add("GET", API.deviceCodes, (ctx) => ({
    status: 200,
    data: ctx.repos.devices.listDeviceCodes(),
  }));

  router.add("POST", API.deviceCodes, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "device-codes.create", requestFingerprint(body.raw), () => {
      const input = asObject(body.value);
      const code = str(input, "code").trim().toUpperCase();
      if (!CODE_PATTERN.test(code)) {
        throw new HttpError("INVALID_ARGUMENT", "设备码至少 6 位，仅限字母、数字与连字符", {
          code: "A-Z 0-9 -",
        });
      }
      const deviceId = input.device_id === undefined || input.device_id === null
        ? null
        : str(input, "device_id");

      const record = ctx.repos.devices.registerDeviceCode(code, deviceId);
      ctx.repos.audit.append({
        actor_id: ctx.auth?.user_id ?? null,
        actor_role: ctx.auth?.role ?? null,
        action: "device.code.add",
        target_type: "device_code",
        target_id: record.code,
      });
      return { status: 201, data: record };
    });
  });

  router.add("DELETE", API.deviceCode(":code"), (ctx) => {
    const code = ctx.params.code ?? "";
    const removed = ctx.repos.devices.removeDeviceCode(code);
    if (!removed) throw new HttpError("NOT_FOUND", `设备码不存在：${code}`);
    ctx.repos.audit.append({
      actor_id: ctx.auth?.user_id ?? null,
      actor_role: ctx.auth?.role ?? null,
      action: "device.code.remove",
      target_type: "device_code",
      target_id: removed.code,
    });
    return { status: 200, data: removed };
  });
}