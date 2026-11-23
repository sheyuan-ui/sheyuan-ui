import type { DeviceStatus, DeviceTaskState } from "../contracts/types.ts";
import type { Db } from "../db/open.ts";
import { NotFoundError, ValidationError } from "../db/errors.ts";
import { isoAfter, nowIso, toIso } from "../db/time.ts";
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

export type PairCodeResult =
  | { ok: true; device_id: string }
  | { ok: false; reason: "not_found" | "expired" | "consumed" };

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

  hasPairCode(code: string): boolean {
    return this.db.prepare("SELECT 1 AS ok FROM pairing_code WHERE code = ?").get(code) !== undefined;
  }

  /** 签发短期配对码；同一设备此前的码全部作废。 */
  issuePairCode(deviceId: string, code: string, ttlMs = 120_000, issuedAt: string = nowIso()): {
    code: string;
    device_id: string;
    issued_at: string;
    expires_at: string;
  } {
    if (!code) throw new ValidationError("配对码不能为空");
    if (ttlMs <= 0) throw new ValidationError("配对码有效期必须大于 0");
    const issued = toIso(issuedAt);
    const expires = isoAfter(issued, ttlMs);

    this.register(deviceId);

    withTransaction(this.db, () => {
      this.db.prepare("DELETE FROM pairing_code WHERE device_id = ?").run(deviceId);
      this.db
        .prepare(
          `INSERT INTO pairing_code (code, device_id, issued_at, expires_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(code, deviceId, issued, expires);
    });

    return { code, device_id: deviceId, issued_at: issued, expires_at: expires };
  }

  consumePairCode(code: string, consumedAt: string = nowIso()): PairCodeResult {
    const now = toIso(consumedAt);
    return withTransaction(this.db, () => {
      const row = this.db
        .prepare("SELECT device_id, expires_at, consumed_at FROM pairing_code WHERE code = ?")
        .get(code) as unknown as
        | { device_id: string; expires_at: string; consumed_at: string | null }
        | undefined;

      if (!row) return { ok: false, reason: "not_found" } as const;
      if (row.consumed_at !== null) return { ok: false, reason: "consumed" } as const;
      if (row.expires_at < now) return { ok: false, reason: "expired" } as const;

      this.db
        .prepare("UPDATE pairing_code SET consumed_at = ? WHERE code = ?")
        .run(now, code);
      this.db
        .prepare("UPDATE device SET pair_status = 'paired', updated_at = ? WHERE device_id = ?")
        .run(now, row.device_id);

      return { ok: true, device_id: row.device_id } as const;
    });
  }
}