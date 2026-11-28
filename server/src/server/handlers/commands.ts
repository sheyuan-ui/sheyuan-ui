import { randomUUID } from "node:crypto";
import { API } from "../../contracts/api.ts";
import type { Command, CommandAction, CommandOutcome } from "../../contracts/types.ts";
import { isoAfter, nowIso } from "../../db/time.ts";
import { withTransaction } from "../../db/transaction.ts";
import { readJsonBody } from "../body.ts";
import { publishCommandResult } from "../command-events.ts";
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

/** 设备可回报的终态；accepted 由下发产生，timeout 由服务端判定 */
const DEVICE_OUTCOMES: readonly CommandOutcome[] = ["completed", "rejected", "failed"];

/** 回执路径先放 handler 本地，待 T02 并入契约 */
const COMMAND_RESULT_PATH = `${API.command(":id")}/result`;

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
          actor_id: ctx.auth?.user_id ?? null,
          actor_role: ctx.auth?.role ?? null,
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

  /* -------- 设备侧：执行结果回执（设备令牌鉴权，不走人账号角色矩阵） -------- */

  router.add("POST", COMMAND_RESULT_PATH, async (ctx) => {
    const commandId = ctx.params.id as string;
    const body = await readJsonBody(ctx.req);
    const input = asObject(body.value);
    const state = enumOf(input, "state", DEVICE_OUTCOMES);
    const code = nullableStr(input, "code");
    const message = nullableStr(input, "message");
    const finishedAt = input.finished_at === undefined ? nowIso() : isoStr(input, "finished_at");
    const reportedDevice = nullableStr(input, "device_id");

    const command = ctx.repos.commands.get(commandId);
    if (!command) throw new HttpError("NOT_FOUND", `指令不存在：${commandId}`);

    // 设备令牌是共享的，必须再确认回执设备就是指令归属设备
    if (reportedDevice !== null && reportedDevice !== command.device_id) {
      throw new HttpError("INVALID_ARGUMENT", "device_id 与指令归属设备不一致", {
        command_device_id: command.device_id,
        reported_device_id: reportedDevice,
      });
    }

    if (command.result.state !== "accepted") {
      const replay =
        command.result.state === state &&
        command.result.code === code &&
        command.result.message === message;
      if (replay) return { status: 200, data: command };
      throw new HttpError("CONFLICT", `指令已是 ${command.result.state}，不能再改为 ${state}`, {
        current_state: command.result.state,
        requested_state: state,
      });
    }

    const updated = ctx.repos.commands.setResult(commandId, {
      state,
      code,
      message,
      finished_at: finishedAt,
    });
    // 条件更新落空说明 sweeper 已并发改判 timeout
    if (updated.result.state !== state) {
      throw new HttpError("CONFLICT", `指令已是 ${updated.result.state}，不能再改为 ${state}`, {
        current_state: updated.result.state,
        requested_state: state,
      });
    }

    ctx.repos.audit.append({
      actor_id: null,
      actor_role: null,
      action: "command.result",
      target_type: "command",
      target_id: commandId,
      detail: { device_id: command.device_id, state, code },
    });
    publishCommandResult(ctx.hub, updated);

    return { status: 200, data: updated };
  });
}