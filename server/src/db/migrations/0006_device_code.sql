-- T08 设备码库：设备码是设备的唯一身份证，一台设备一个码
-- 管理员先登记设备码；配对时扫热点读回设备码，命中本表才建立连接。

CREATE TABLE device_code (
  code       TEXT PRIMARY KEY,
  -- 绑定到哪台设备；登记时设备可以尚未注册，配对时再绑定
  device_id  TEXT UNIQUE REFERENCES device (device_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  -- 首次按该码配对的时刻；重复配对不覆盖
  paired_at  TEXT
);

CREATE INDEX idx_device_code_device ON device_code (device_id);