import { randomUUID } from "node:crypto";
import { API } from "../../contracts/api.ts";
import type { Command, CommandAction } from "../../contracts/types.ts";
import { isoAfter, nowIso } from "../../db/time.ts";
import { withTransaction } from "../../db/transaction.ts";
import { readJsonBody } from "../body.ts";
import { HttpError } from "../http-errors.ts";
import { requestFingerprint, withIdempotency } from "../idempotency.ts";
import type { Router } from "../router.ts";
import { asObject, enumOf, int, isoStr, nullableStr, str } from "../validate.ts";

const ACTIONS: readonly CommandAction[] = [
  "start_job",
  "pause_job",
  "resume_job",
  "end_job",
  "snapshot",
  "sync_time",
  "reboot",
];

export function registerCommandRoutes(router: Router): void {
  router.add("POST", API.commands, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "commands.create", requestFingerprint(body.raw), () => {
      const input = asObject(body.value);
      const deviceId = str(input, "device_id");
      const action = enumOf(input, "action", ACTIONS);
      const expectedVersion = int(input, "expected_state_version", { min: 0 });
      const sessionId = nullableStr(input, "session_id");

      const issuedAt = input.issued_at === undefined ? nowIso() : isoStr(input, "issued_at");
      const expiresAt =
        input.expires_at !== undefined
          ? isoStr(input, "expires_at")
          : isoAfter(
              issuedAt,
              input.ttl_ms === undefined ? 10_000 : int(input, "ttl_ms", { min: 1_000, max: 600_000 }),
            );

      const command: Command = {
        command_id: input.command_id === undefined ? randomUUID() : str(input, "command_id"),
        device_id: deviceId,
        session_id: sessionId,
        expected_state_version: expectedVersion,
        action,
        issued_at: issuedAt,
        expires_at: expiresAt,
        result: { state: "accepted", code: null, message: null, finished_at: null },
      };

      // 版本校验与落库同一事务，避免设备刚好上报新状态时把旧版本指令写进去
      const created = withTransaction(ctx.repos.devices.db, () => {
        const current = ctx.repos.devices.getStatus(deviceId);
        if (!current) {
          if (!ctx.repos.devices.getDevice(deviceId)) {
            throw new HttpError("NOT_FOUND", `设备不存在：${deviceId}`);
          }
          throw new HttpError("CONFLICT", "设备尚未上报状态，无法校验版本", {
            device_id: deviceId,
          });
        }
        if (current.state_version !== expectedVersion) {
          throw new HttpError("CONFLICT", "设备状态已变化，请刷新后重试", {
            expected_state_version: String(expectedVersion),
            current_state_version: String(current.state_version),
          });
        }
        if (sessionId !== null && !ctx.repos.sessions.get(sessionId)) {
          throw new HttpError("NOT_FOUND", `会话不存在：${sessionId}`);
        }

        const row = ctx.repos.commands.create(command);
        ctx.repos.audit.append({
          action: "command.issue",
          target_type: "command",
          target_id: row.command_id,
          detail: { device_id: deviceId, action },
        });
        return row;
      });
      return { status: 201, data: created };
    });
  });

  router.add("GET", API.command(":id"), (ctx) => {
    const commandId = ctx.params.id as string;
    const command = ctx.repos.commands.get(commandId);
    if (!command) throw new HttpError("NOT_FOUND", `指令不存在：${commandId}`);
    return { status: 200, data: command };
  });
}