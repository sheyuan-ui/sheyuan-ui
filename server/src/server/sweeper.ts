import { WS_TOPICS } from "../contracts/api.ts";
import type { Repositories } from "../repos/index.ts";
import type { Hub } from "./hub.ts";

/** 建议设备每 5 秒心跳一次；离线阈值留出 3 个周期，容忍偶发丢包。 */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
export const DEFAULT_OFFLINE_TIMEOUT_MS = 15_000;

export interface OfflineEvent {
  device_id: string;
  online: false;
  last_seen: string;
  offline_since: string;
  /** 四态派生（T07）：心跳超时判定必然是离线 */
  state: "offline";
  state_reason: "heartbeat_timeout";
}

export interface OfflineSweeperOptions {
  heartbeatIntervalMs?: number;
  offlineTimeoutMs?: number;
  logger?: (message: string) => void;
}

export interface OfflineSweeper {
  readonly heartbeatIntervalMs: number;
  readonly offlineTimeoutMs: number;
  start(): void;
  stop(): void;
  /** 立即执行一次超时判定；供定时器与测试共用 */
  run(): OfflineEvent[];
}

/**
 * 心跳超时判定：改在场状态并推送 device.status（带四态离线标记）。
 * 完整四态派生见 device/state.ts（T07）。
 */
export function createOfflineSweeper(
  repos: Repositories,
  hub: Hub,
  options: OfflineSweeperOptions = {},
): OfflineSweeper {
  const offlineTimeoutMs = options.offlineTimeoutMs ?? DEFAULT_OFFLINE_TIMEOUT_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  if (offlineTimeoutMs <= 0) throw new Error("offlineTimeoutMs 必须大于 0");
  if (heartbeatIntervalMs <= 0) throw new Error("heartbeatIntervalMs 必须大于 0");

  let timer: NodeJS.Timeout | null = null;

  function run(): OfflineEvent[] {
    const cutoff = new Date(Date.now() - offlineTimeoutMs).toISOString();
    const stale = repos.presence.listStale(cutoff);
    const events: OfflineEvent[] = [];

    for (const item of stale) {
      const presence = repos.presence.markOffline(item.device_id);
      const event: OfflineEvent = {
        device_id: presence.device_id,
        online: false,
        last_seen: presence.last_seen,
        offline_since: presence.offline_since ?? presence.updated_at,
        state: "offline",
        state_reason: "heartbeat_timeout",
      };
      hub.publish(WS_TOPICS.deviceStatus, event);
      events.push(event);
      options.logger?.(
        `设备 ${presence.device_id} 超过 ${offlineTimeoutMs}ms 未心跳，标记离线`,
      );
    }

    return events;
  }

  return {
    heartbeatIntervalMs,
    offlineTimeoutMs,
    start() {
      if (timer !== null) return;
      timer = setInterval(() => {
        try {
          run();
        } catch (error) {
          options.logger?.(
            `心跳超时判定失败：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }, heartbeatIntervalMs);
      timer.unref();
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    run,
  };
}
