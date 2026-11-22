import type { Command, CommandAction, CommandResult } from "../contracts/types.ts";
import type { Db } from "../db/open.ts";
import { ConflictError, NotFoundError, ValidationError } from "../db/errors.ts";
import { isUniqueViolation } from "../db/sqlite-errors.ts";
import { nowIso, toIso } from "../db/time.ts";

interface CommandRow {
  command_id: string;
  device_id: string;
  session_id: string | null;
  expected_state_version: number;
  action: CommandAction;
  issued_at: string;
  expires_at: string;
  result_state: CommandResult["state"];
  result_code: string | null;
  result_message: string | null;
  finished_at: string | null;
}

function toCommand(row: CommandRow): Command {
  return {
    command_id: row.command_id,
    device_id: row.device_id,
    session_id: row.session_id,
    expected_state_version: row.expected_state_version,
    action: row.action,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    result: {
      state: row.result_state,
      code: row.result_code,
      message: row.result_message,
      finished_at: row.finished_at,
    },
  };
}

export class CommandRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  create(command: Command): Command {
    if (toIso(command.expires_at) < toIso(command.issued_at)) {
      throw new ValidationError("expires_at 不能早于 issued_at");
    }
    try {
      this.db
        .prepare(
          `INSERT INTO command (
             command_id, device_id, session_id, expected_state_version, action,
             issued_at, expires_at,
             result_state, result_code, result_message, finished_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          command.command_id,
          command.device_id,
          command.session_id,
          command.expected_state_version,
          command.action,
          toIso(command.issued_at),
          toIso(command.expires_at),
          command.result.state,
          command.result.code,
          command.result.message,
          command.result.finished_at === null ? null : toIso(command.result.finished_at),
          nowIso(),
        );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`指令已存在：${command.command_id}`);
      throw error;
    }

    const created = this.get(command.command_id);
    if (!created) throw new NotFoundError("指令", command.command_id);
    return created;
  }

  get(commandId: string): Command | null {
    const row = this.db
      .prepare("SELECT * FROM command WHERE command_id = ?")
      .get(commandId) as unknown as CommandRow | undefined;
    return row ? toCommand(row) : null;
  }

  /**
   * 回报执行结果。已进入终态（completed/rejected/timeout/failed）的指令不再改写，
   * 重复回执按幂等处理直接返回当前值。
   */
  setResult(commandId: string, result: CommandResult): Command {
    const current = this.get(commandId);
    if (!current) throw new NotFoundError("指令", commandId);
    if (current.result.state !== "accepted") return current;

    this.db
      .prepare(
        `UPDATE command SET result_state = ?, result_code = ?, result_message = ?, finished_at = ?
         WHERE command_id = ?`,
      )
      .run(
        result.state,
        result.code,
        result.message,
        result.finished_at === null ? null : toIso(result.finished_at),
        commandId,
      );

    const updated = this.get(commandId);
    if (!updated) throw new NotFoundError("指令", commandId);
    return updated;
  }

  /** 超过 expires_at 仍为 accepted 的指令改判 timeout；返回处理条数。 */
  expireOverdue(at: string = nowIso()): number {
    const now = toIso(at);
    return Number(
      this.db
        .prepare(
          `UPDATE command SET result_state = 'timeout', finished_at = ?
           WHERE result_state = 'accepted' AND expires_at < ?`,
        )
        .run(now, now).changes,
    );
  }

  listByDevice(deviceId: string, limit = 50): Command[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM command WHERE device_id = ? ORDER BY issued_at DESC, command_id LIMIT ?",
      )
      .all(deviceId, limit) as unknown as CommandRow[];
    return rows.map(toCommand);
  }

  listBySession(sessionId: string): Command[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM command WHERE session_id = ? ORDER BY issued_at, command_id",
      )
      .all(sessionId) as unknown as CommandRow[];
    return rows.map(toCommand);
  }
}