import { WS_TOPICS } from "../contracts/api.ts";
import type { Command } from "../contracts/types.ts";
import type { Hub } from "./hub.ts";

/**
 * 指令回执/超时统一推送载荷。
 * 主题名已在 T02 契约中预留，载荷待 T15 定稿后并入契约。
 */
export interface CommandResultEvent {
  command_id: string;
  device_id: string;
  session_id: string | null;
  action: Command["action"];
  result: Command["result"];
}

export function publishCommandResult(hub: Hub, command: Command): void {
  const event: CommandResultEvent = {
    command_id: command.command_id,
    device_id: command.device_id,
    session_id: command.session_id,
    action: command.action,
    result: command.result,
  };
  hub.publish(WS_TOPICS.commandResult, event);
}
