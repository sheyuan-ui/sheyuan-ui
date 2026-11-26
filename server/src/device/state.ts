/**
 * T07 设备四态派生：运行中 / 在线 / 离线 / 故障。
 *
 * 四态不落库，由「设备自报快照 + 服务端在场状态」实时推导：
 * 离线由心跳超时判定（服务端时钟），因此设备掉线后不会永远停在「运行中」；
 * 设备最后一条快照在离线后视为不可信，故障判定只在在线时生效。
 */
import type { DeviceStatus, DeviceRuntimeState, DeviceStateReason, DeviceRuntimeView } from "../contracts/types.ts";
import type { PresenceRecord } from "../repos/presence.ts";
import { nowIso, toIso } from "../db/time.ts";

export type { DeviceRuntimeState, DeviceStateReason, DeviceRuntimeView };

/**
 * 推导优先级：离线 > 故障 > 运行中 > 在线。
 * - 离线：服务端没收到心跳，设备最后状态不再可信
 * - 故障：设备上报 error，或自报连不上管理服务
 * - 运行中：设备处于启动/录制/暂停/停止过程中
 * - 在线：设备在线且空闲
 */
export function deriveDeviceState(input: {
  status: DeviceStatus | null;
  presence: PresenceRecord | null;
  now?: string;
}): DeviceRuntimeView {
  const { status, presence } = input;
  const now = toIso(input.now ?? nowIso());

  if (presence === null) {
    return {
      state: "offline",
      reason: "never_seen",
      online: false,
      last_seen: status?.last_seen ?? null,
      offline_since: null,
      offline_ms: null,
    };
  }

  if (!presence.online) {
    const since = presence.offline_since;
    return {
      state: "offline",
      reason: "heartbeat_timeout",
      online: false,
      last_seen: presence.last_seen,
      offline_since: since,
      offline_ms: since === null ? null : Math.max(0, Date.parse(now) - Date.parse(since)),
    };
  }

  if (status === null) {
    return {
      state: "online",
      reason: "idle",
      online: true,
      last_seen: presence.last_seen,
      offline_since: null,
      offline_ms: null,
    };
  }

  if (status.task_state === "error") {
    return {
      state: "fault",
      reason: "device_error",
      online: true,
      last_seen: presence.last_seen,
      offline_since: null,
      offline_ms: null,
    };
  }

  if (!status.hub_reachable) {
    return {
      state: "fault",
      reason: "hub_unreachable",
      online: true,
      last_seen: presence.last_seen,
      offline_since: null,
      offline_ms: null,
    };
  }

  if (status.task_state !== "idle") {
    return {
      state: "running",
      reason: "task_active",
      online: true,
      last_seen: presence.last_seen,
      offline_since: null,
      offline_ms: null,
    };
  }

  return {
    state: "online",
    reason: "idle",
    online: true,
    last_seen: presence.last_seen,
    offline_since: null,
    offline_ms: null,
  };
}
