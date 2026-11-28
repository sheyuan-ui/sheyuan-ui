import { useCallback, useEffect, useRef, useState } from "react";
import { API, WS_TOPICS } from "../contracts/api";
import type { DeviceStatus, DeviceRuntimeView } from "../contracts/types";
import { API_BASE, request } from "./client";

/** 服务端设备总览行（T02 文档 4.3），不改动契约原始字段。 */
export type PairStatus = "unpaired" | "paired" | "revoked";

export interface DeviceSummary {
  device_id: string;
  alias: string | null;
  pair_status: PairStatus;
  /** 管理员设备码库中绑定到该设备的码；未登记为 null */
  device_code: string | null;
  status: DeviceStatus | null;
  runtime: DeviceRuntimeView;
}

/** 设备码库条目：设备码是设备身份证，登记后扫到码即可配对。 */
export interface DeviceCodeEntry {
  code: string;
  device_id: string | null;
  pair_status: PairStatus | null;
  created_at: string;
  paired_at: string | null;
}

export function fetchDeviceCodes(signal?: AbortSignal): Promise<DeviceCodeEntry[]> {
  return request<DeviceCodeEntry[]>(API.deviceCodes, { signal });
}

/** 轮询间隔：服务端目前只在上/下线时推送，设备在线中切换任务态要靠轮询兜底。 */
const POLL_MS = 10_000;
const RECONNECT_MAX_MS = 30_000;
const REFRESH_DEBOUNCE_MS = 300;

export function fetchDevices(signal?: AbortSignal): Promise<DeviceSummary[]> {
  return request<DeviceSummary[]>(API.devices, { signal });
}

export interface DevicesFeed {
  devices: DeviceSummary[] | null;
  /** 首次加载（还没有任何数据）时为 true；轮询刷新不置为 true */
  loading: boolean;
  /** 只在没有可用数据时暴露错误，避免轮询失败把已有列表打空 */
  error: unknown;
  refreshing: boolean;
  syncedAt: Date | null;
  reload: () => Promise<void>;
}

function wsUrl(): string {
  const base = API_BASE.length > 0 ? API_BASE : window.location.origin;
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = `?topics=${WS_TOPICS.deviceStatus}`;
  return url.toString();
}

/**
 * 设备列表取数：GET /api/devices + device.status 推送 + 轮询兜底。
 * 订阅断开按 1s→2s→4s…上限 30s 退避重连，重连成功立即补拉一次。
 */
export function useDevicesFeed(enabled: boolean): DevicesFeed {
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const seq = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!enabled) return;
      const ticket = ++seq.current;
      if (!quiet) setRefreshing(true);
      try {
        const next = await fetchDevices();
        if (ticket !== seq.current) return;
        hasData.current = true;
        setDevices(next);
        setError(null);
        setSyncedAt(new Date());
      } catch (err) {
        if (ticket !== seq.current) return;
        if (!hasData.current) setError(err);
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let refreshTimer: number | null = null;
    let attempts = 0;

    const scheduleRefresh = () => {
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void load(true);
      }, REFRESH_DEBOUNCE_MS);
    };

    const connect = () => {
      if (disposed) return;
      try {
        socket = new WebSocket(wsUrl());
      } catch {
        reconnectTimer = window.setTimeout(connect, 1000);
        attempts += 1;
        return;
      }
      socket.onopen = () => {
        attempts = 0;
        void load(true);
      };
      socket.onmessage = scheduleRefresh;
      socket.onclose = () => {
        if (disposed) return;
        const delay = Math.min(1000 * 2 ** attempts, RECONNECT_MAX_MS);
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket?.close();
    };

    // 首屏用静默加载，loading 由 devices 是否为空推导，避免按钮闪“刷新中”
    queueMicrotask(() => {
      if (!disposed) void load(true);
    });
    const pollTimer = window.setInterval(() => void load(true), POLL_MS);
    connect();

    return () => {
      disposed = true;
      socket?.close();
      window.clearInterval(pollTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [enabled, load]);

  return {
    devices,
    loading: enabled && devices === null && error === null,
    error,
    refreshing,
    syncedAt,
    reload: () => load(false),
  };
}