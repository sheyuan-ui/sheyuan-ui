import type { DeviceStatus, DeviceTaskState } from "../contracts/types.ts";
import type { Db } from "../db/open.ts";
import { ConflictError, NotFoundError, ValidationError } from "../db/errors.ts";
import { nowIso, toIso } from "../db/time.ts";
import { withTransaction } from "../db/transaction.ts";

export type PairStatus = "unpaired" | "paired" | "revoked";

export interface DeviceRecord {
  device_id: string;
  alias: string | null;
  pair_status: PairStatus;
  ip_address: string | null;
  /** 注册时上报的设备档案；未注册过为 null */
  model: string | null;
  firmware_version: string | null;
  created_at: string;
  updated_at: string;
}

export type PairByCodeResult = { ok: true; device_id: string; device_code: string }
  | { ok: false; reason: "not_found" | "unbound" | "mismatch" | "device_not_found" };

/** 设备码库条目：code 是设备唯一身份证，device_id 在配对时绑定 */
export interface DeviceCodeRecord {
  code: string;
  device_id: string | null;
  /** 绑定设备的配对状态；未绑定为 null */
  pair_status: PairStatus | null;
  created_at: string;
  paired_at: string | null;
}

interface DeviceCodeRow {
  code: string;
  device_id: string | null;
  pair_status: PairStatus | null;
  created_at: string;
  paired_at: string | null;
}

interface DeviceRow {
  device_id: string;
  alias: string | null;
  pair_status: PairStatus;
  ip_address: string | null;
  model: string | null;
  firmware_version: string | null;
  created_at: string;
  updated_at: string;
}

interface StatusRow {
  device_id: string;
  model: string;
  firmware_version: string;
  battery_pct: number | null;
  wifi_connected: number;
  wifi_ssid: string | null;
  wifi_rssi_dbm: number | null;
  hub_reachable: number;
  cloud_reachable: number;
  task_state: DeviceTaskState;
  storage_free_bytes: number;
  last_seen: string;
  state_version: number;
}

function toDevice(row: DeviceRow): DeviceRecord {
  return {
    device_id: row.device_id,
    alias: row.alias,
    pair_status: row.pair_status,
    ip_address: row.ip_address,
    model: row.model,
    firmware_version: row.firmware_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toStatus(row: StatusRow): DeviceStatus {
  return {
    device_id: row.device_id,
    model: row.model,
    firmware_version: row.firmware_version,
    battery_pct: row.battery_pct,
    wifi: {
      connected: row.wifi_connected === 1,
      ssid: row.wifi_ssid,
      rssi_dbm: row.wifi_rssi_dbm,
    },
    hub_reachable: row.hub_reachable === 1,
    cloud_reachable: row.cloud_reachable === 1,
    task_state: row.task_state,
    storage_free_bytes: row.storage_free_bytes,
    last_seen: row.last_seen,
    state_version: row.state_version,
  };
}

export class DeviceRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /** 心跳可自动注册未配对设备；已存在的设备不改别名与配对状态。 */
  register(
    deviceId: string,
    options: {
      alias?: string | null;
      ipAddress?: string | null;
      model?: string | null;
      firmwareVersion?: string | null;
    } = {},
  ): DeviceRecord {
    if (!deviceId) throw new ValidationError("device_id 不能为空");
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO device (device_id, alias, pair_status, ip_address, model, firmware_version, created_at, updated_at)
         VALUES (?, ?, 'unpaired', ?, ?, ?, ?, ?)
         ON CONFLICT (device_id) DO UPDATE SET
           alias = COALESCE(device.alias, excluded.alias),
           ip_address = COALESCE(excluded.ip_address, device.ip_address),
           model = COALESCE(excluded.model, device.model),
           firmware_version = COALESCE(excluded.firmware_version, device.firmware_version),
           updated_at = excluded.updated_at`,
      )
      .run(
        deviceId,
        options.alias ?? null,
        options.ipAddress ?? null,
        options.model ?? null,
        options.firmwareVersion ?? null,
        now,
        now,
      );
    const device = this.getDevice(deviceId);
    if (!device) throw new NotFoundError("设备", deviceId);
    return device;
  }

  getDevice(deviceId: string): DeviceRecord | null {
    const row = this.db
      .prepare("SELECT * FROM device WHERE device_id = ?")
      .get(deviceId) as unknown as DeviceRow | undefined;
    return row ? toDevice(row) : null;
  }

  listDevices(): DeviceRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM device ORDER BY created_at, device_id")
      .all() as unknown as DeviceRow[];
    return rows.map(toDevice);
  }

  setPairStatus(deviceId: string, status: PairStatus, ipAddress: string | null = null): DeviceRecord {
    const now = nowIso();
    const changes = this.db
      .prepare(
        `UPDATE device
         SET pair_status = ?, ip_address = COALESCE(?, ip_address), updated_at = ?
         WHERE device_id = ?`,
      )
      .run(status, ipAddress, now, deviceId).changes;
    if (Number(changes) === 0) throw new NotFoundError("设备", deviceId);
    const device = this.getDevice(deviceId);
    if (!device) throw new NotFoundError("设备", deviceId);
    return device;
  }

  setAlias(deviceId: string, alias: string | null): DeviceRecord {
    const changes = this.db
      .prepare("UPDATE device SET alias = ?, updated_at = ? WHERE device_id = ?")
      .run(alias, nowIso(), deviceId).changes;
    if (Number(changes) === 0) throw new NotFoundError("设备", deviceId);
    const device = this.getDevice(deviceId);
    if (!device) throw new NotFoundError("设备", deviceId);
    return device;
  }

  /**
   * 写入设备最新状态。state_version 更小的上报视为陈旧数据丢弃，返回 false。
   * 未注册设备（新头盔）自动登记为待配对。
   */
  upsertStatus(status: DeviceStatus, receivedAt: string = nowIso()): boolean {
    if (!status.device_id) throw new ValidationError("device_id 不能为空");
    const now = toIso(receivedAt);

    return withTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO device (device_id, created_at, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (device_id) DO NOTHING`,
        )
        .run(status.device_id, now, now);

      const changes = this.db
        .prepare(
          `INSERT INTO device_status (
             device_id, model, firmware_version, battery_pct,
             wifi_connected, wifi_ssid, wifi_rssi_dbm,
             hub_reachable, cloud_reachable, task_state,
             storage_free_bytes, last_seen, state_version, received_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (device_id) DO UPDATE SET
             model = excluded.model,
             firmware_version = excluded.firmware_version,
             battery_pct = excluded.battery_pct,
             wifi_connected = excluded.wifi_connected,
             wifi_ssid = excluded.wifi_ssid,
             wifi_rssi_dbm = excluded.wifi_rssi_dbm,
             hub_reachable = excluded.hub_reachable,
             cloud_reachable = excluded.cloud_reachable,
             task_state = excluded.task_state,
             storage_free_bytes = excluded.storage_free_bytes,
             last_seen = excluded.last_seen,
             state_version = excluded.state_version,
             received_at = excluded.received_at
           WHERE excluded.state_version >= device_status.state_version`,
        )
        .run(
          status.device_id,
          status.model,
          status.firmware_version,
          status.battery_pct,
          status.wifi.connected ? 1 : 0,
          status.wifi.ssid,
          status.wifi.rssi_dbm,
          status.hub_reachable ? 1 : 0,
          status.cloud_reachable ? 1 : 0,
          status.task_state,
          status.storage_free_bytes,
          toIso(status.last_seen),
          status.state_version,
          now,
        ).changes;

      return Number(changes) > 0;
    });
  }

  getStatus(deviceId: string): DeviceStatus | null {
    const row = this.db
      .prepare("SELECT * FROM device_status WHERE device_id = ?")
      .get(deviceId) as unknown as StatusRow | undefined;
    return row ? toStatus(row) : null;
  }

  /** 按最近上报排序，供设备总览；没有状态上报的设备不出现。 */
  listStatuses(): DeviceStatus[] {
    const rows = this.db
      .prepare("SELECT * FROM device_status ORDER BY last_seen DESC, device_id")
      .all() as unknown as StatusRow[];
    return rows.map(toStatus);
  }

  /* ---------------- 设备码库 ---------------- */

  listDeviceCodes(): DeviceCodeRecord[] {
    const rows = this.db
      .prepare(
        `SELECT c.code, c.device_id, d.pair_status, c.created_at, c.paired_at
         FROM device_code c
         LEFT JOIN device d ON d.device_id = c.device_id
         ORDER BY c.created_at, c.code`,
      )
      .all() as unknown as DeviceCodeRow[];
    return rows.map(toDeviceCode);
  }

  /** 登记设备码；只登记白名单，绑定设备在配对时完成。 */
  registerDeviceCode(
    code: string,
    deviceId: string | null = null,
    createdAt: string = nowIso(),
  ): DeviceCodeRecord {
    const normalized = normalizeDeviceCode(code);
    const now = toIso(createdAt);
    if (this.db.prepare("SELECT 1 AS ok FROM device_code WHERE code = ?").get(normalized)) {
      throw new ConflictError(`设备码已在库中：${normalized}`);
    }
    if (deviceId !== null && this.getDevice(deviceId) === null) {
      throw new NotFoundError("设备", deviceId);
    }
    this.db
      .prepare("INSERT INTO device_code (code, device_id, created_at) VALUES (?, ?, ?)")
      .run(normalized, deviceId, now);
    const record = this.listDeviceCodes().find((item) => item.code === normalized);
    if (!record) throw new NotFoundError("设备码", normalized);
    return record;
  }

  /** 移除设备码；已绑定的设备同步断开配对。 */
  removeDeviceCode(code: string): { code: string; device_id: string | null } | null {
    const normalized = normalizeDeviceCode(code);
    return withTransaction(this.db, () => {
      const row = this.db
        .prepare("SELECT code, device_id FROM device_code WHERE code = ?")
        .get(normalized) as unknown as
        | { code: string; device_id: string | null }
        | undefined;
      if (!row) return null;
      this.db.prepare("DELETE FROM device_code WHERE code = ?").run(normalized);
      if (row.device_id !== null) {
        this.db
          .prepare("UPDATE device SET pair_status = 'unpaired', updated_at = ? WHERE device_id = ?")
          .run(nowIso(), row.device_id);
      }
      return { code: row.code, device_id: row.device_id };
    });
  }

  /**
   * 扫到设备码后按库配对：码必须在库中；未绑定设备时用扫码结果绑定。
   * 设备码是持久身份，重复配对直接返回成功。
   */
  pairByDeviceCode(
    code: string,
    deviceId: string | null = null,
    ipAddress: string | null = null,
    pairedAt: string = nowIso(),
  ): PairByCodeResult {
    const normalized = normalizeDeviceCode(code);
    const now = toIso(pairedAt);
    return withTransaction(this.db, () => {
      const row = this.db
        .prepare("SELECT code, device_id FROM device_code WHERE code = ?")
        .get(normalized) as unknown as
        | { code: string; device_id: string | null }
        | undefined;
      if (!row) return { ok: false, reason: "not_found" } as const;

      let target = row.device_id;
      if (target === null) {
        if (deviceId === null) return { ok: false, reason: "unbound" } as const;
        if (this.getDevice(deviceId) === null) {
          return { ok: false, reason: "device_not_found" } as const;
        }
        target = deviceId;
      } else if (deviceId !== null && deviceId !== target) {
        return { ok: false, reason: "mismatch" } as const;
      }

      this.db
        .prepare(
          "UPDATE device_code SET device_id = ?, paired_at = COALESCE(paired_at, ?) WHERE code = ?",
        )
        .run(target, now, normalized);
      this.db
        .prepare(
          `UPDATE device
           SET pair_status = 'paired', ip_address = COALESCE(?, ip_address), updated_at = ?
           WHERE device_id = ?`,
        )
        .run(ipAddress, now, target);

      return { ok: true, device_id: target, device_code: normalized } as const;
    });
  }
}

function normalizeDeviceCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized.length === 0) throw new ValidationError("设备码不能为空");
  return normalized;
}

function toDeviceCode(row: DeviceCodeRow): DeviceCodeRecord {
  return {
    code: row.code,
    device_id: row.device_id,
    pair_status: row.pair_status,
    created_at: row.created_at,
    paired_at: row.paired_at,
  };
}