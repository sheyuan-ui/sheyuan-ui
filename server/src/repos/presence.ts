import { NotFoundError, ValidationError } from "../db/errors.ts";
import type { Db } from "../db/open.ts";
import { nowIso, toIso } from "../db/time.ts";

/** 设备在场状态：心跳写入「在线」，超时判定改写「离线」。 */
export interface PresenceRecord {
  device_id: string;
  online: boolean;
  /** 最近一次收到心跳的时刻（服务端时钟） */
  last_seen: string;
  /** 最近一次转为离线的时刻；在线时为 null */
  offline_since: string | null;
  updated_at: string;
}

interface PresenceRow {
  device_id: string;
  online: number;
  last_seen: string;
  offline_since: string | null;
  updated_at: string;
}

function toPresence(row: PresenceRow): PresenceRecord {
  return {
    device_id: row.device_id,
    online: row.online === 1,
    last_seen: row.last_seen,
    offline_since: row.offline_since,
    updated_at: row.updated_at,
  };
}

export class PresenceRepository {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * 收到注册或心跳：写入在场时刻并置为在线。
   * cameOnline 只在「首次出现」或「离线转在线」时为 true，用于避免每条心跳都推送。
   */
  markSeen(deviceId: string, seenAt: string = nowIso()): { presence: PresenceRecord; cameOnline: boolean } {
    if (!deviceId) throw new ValidationError("device_id 不能为空");
    const seen = toIso(seenAt);
    const previous = this.get(deviceId);

    this.db
      .prepare(
        `INSERT INTO device_presence (device_id, online, last_seen, offline_since, updated_at)
         VALUES (?, 1, ?, NULL, ?)
         ON CONFLICT (device_id) DO UPDATE SET
           online = 1,
           last_seen = excluded.last_seen,
           offline_since = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(deviceId, seen, seen);

    const presence = this.get(deviceId);
    if (!presence) throw new NotFoundError("设备在场状态", deviceId);
    return { presence, cameOnline: previous === null || !previous.online };
  }

  get(deviceId: string): PresenceRecord | null {
    const row = this.db
      .prepare("SELECT * FROM device_presence WHERE device_id = ?")
      .get(deviceId) as unknown as PresenceRow | undefined;
    return row ? toPresence(row) : null;
  }

  /** 仍在在线名单里、但最近心跳早于 cutoff 的设备，供定时任务判定超时。 */
  listStale(cutoffIso: string): PresenceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM device_presence
         WHERE online = 1 AND last_seen < ?
         ORDER BY last_seen, device_id`,
      )
      .all(toIso(cutoffIso)) as unknown as PresenceRow[];
    return rows.map(toPresence);
  }

  /** 转为离线；已在离线的设备不重复改写 offline_since。 */
  markOffline(deviceId: string, offlineAt: string = nowIso()): PresenceRecord {
    const at = toIso(offlineAt);
    const changes = this.db
      .prepare(
        `UPDATE device_presence
         SET online = 0,
             offline_since = COALESCE(offline_since, ?),
             updated_at = ?
         WHERE device_id = ?`,
      )
      .run(at, at, deviceId).changes;
    if (Number(changes) === 0) throw new NotFoundError("设备在场状态", deviceId);
    const presence = this.get(deviceId);
    if (!presence) throw new NotFoundError("设备在场状态", deviceId);
    return presence;
  }
}
