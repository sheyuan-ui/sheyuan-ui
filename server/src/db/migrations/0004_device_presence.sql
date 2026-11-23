-- T05 设备注册与心跳
-- 只增不改：0001–0003 的建表与校验和保持不变。

-- 设备档案：注册时上报，心跳可省略。历史行保持 NULL，由心跳补全。
ALTER TABLE device ADD COLUMN model TEXT;
ALTER TABLE device ADD COLUMN firmware_version TEXT;

-- 在场状态：心跳写入，超时判定改写；与 device_status 分开，避免把在线/离线混进设备上报字段。
CREATE TABLE device_presence (
  device_id     TEXT PRIMARY KEY REFERENCES device (device_id) ON DELETE CASCADE,
  online        INTEGER NOT NULL CHECK (online IN (0, 1)),
  -- 最近一次收到心跳的时刻（服务端时钟），用于超时判定
  last_seen     TEXT NOT NULL,
  -- 每次转为离线的时刻；恢复在线时清空
  offline_since TEXT,
  updated_at    TEXT NOT NULL
);

CREATE INDEX idx_device_presence_online_seen ON device_presence (online, last_seen);
