-- T02 契约六对象 + 现场管理服务必要支撑表
-- 时间列统一存 UTC ISO 8601（带毫秒 Z 形式），由访问层规范化后写入。

/* ------------------------------ 设备 ------------------------------ */

CREATE TABLE device (
  device_id   TEXT PRIMARY KEY,
  alias       TEXT,
  -- 配对状态不属于 DeviceStatus；未配对设备仍可上报心跳
  pair_status TEXT NOT NULL DEFAULT 'unpaired'
              CHECK (pair_status IN ('unpaired', 'paired', 'revoked')),
  ip_address  TEXT,          -- 仅配对流程使用，不对外展示
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE device_status (
  device_id         TEXT PRIMARY KEY REFERENCES device (device_id) ON DELETE CASCADE,
  model             TEXT NOT NULL,
  firmware_version  TEXT NOT NULL,
  battery_pct       REAL CHECK (battery_pct IS NULL OR (battery_pct >= 0 AND battery_pct <= 100)),
  wifi_connected    INTEGER NOT NULL CHECK (wifi_connected IN (0, 1)),
  wifi_ssid         TEXT,
  wifi_rssi_dbm     REAL,
  hub_reachable     INTEGER NOT NULL CHECK (hub_reachable IN (0, 1)),
  cloud_reachable   INTEGER NOT NULL CHECK (cloud_reachable IN (0, 1)),
  task_state        TEXT NOT NULL
                    CHECK (task_state IN ('idle', 'starting', 'recording', 'paused', 'stopping', 'error')),
  storage_free_bytes INTEGER NOT NULL CHECK (storage_free_bytes >= 0),
  -- 设备上报时刻，用于离线判定与旧帧标记
  last_seen         TEXT NOT NULL,
  state_version     INTEGER NOT NULL CHECK (state_version >= 0),
  -- 管理服务收到该上报的时刻
  received_at       TEXT NOT NULL
);

CREATE INDEX idx_device_status_last_seen ON device_status (last_seen);
CREATE INDEX idx_device_status_task_state ON device_status (task_state);

CREATE TABLE pairing_code (
  code            TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL REFERENCES device (device_id) ON DELETE CASCADE,
  issued_at       TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  consumed_at     TEXT,
  CHECK (expires_at >= issued_at)
);

CREATE INDEX idx_pairing_code_device ON pairing_code (device_id);

/* ------------------------------ 任务 ------------------------------ */

CREATE TABLE job (
  job_id             TEXT PRIMARY KEY,
  farm_id            TEXT NOT NULL,
  house_id           TEXT NOT NULL,
  scenario           TEXT NOT NULL CHECK (scenario IN ('broiler', 'layer')),
  batch_id           TEXT NOT NULL,
  owner_name         TEXT NOT NULL,
  -- 地点快照：创建时固化，场区档案后续变更不影响历史
  location_farm_id   TEXT NOT NULL,
  location_farm_name TEXT NOT NULL,
  location_house_id  TEXT NOT NULL,
  location_house_name TEXT NOT NULL,
  geo_lat            REAL CHECK (geo_lat IS NULL OR (geo_lat >= -90 AND geo_lat <= 90)),
  geo_lng            REAL CHECK (geo_lng IS NULL OR (geo_lng >= -180 AND geo_lng <= 180)),
  geo_accuracy_m     REAL CHECK (geo_accuracy_m IS NULL OR geo_accuracy_m >= 0),
  geo_source         TEXT CHECK (geo_source IS NULL OR geo_source IN ('ipad_gps', 'manual')),
  geo_captured_at    TEXT,
  status             TEXT NOT NULL
                     CHECK (status IN ('created', 'dispatched', 'running', 'paused', 'completed', 'cancelled')),
  remark             TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,

  CHECK (location_farm_id = farm_id AND location_house_id = house_id),
  -- geo 要么完整存在，要么整体为 null
  CHECK (
    (geo_lat IS NULL AND geo_lng IS NULL AND geo_accuracy_m IS NULL
      AND geo_source IS NULL AND geo_captured_at IS NULL)
    OR
    (geo_lat IS NOT NULL AND geo_lng IS NOT NULL AND geo_accuracy_m IS NOT NULL
      AND geo_source IS NOT NULL AND geo_captured_at IS NOT NULL)
  )
);

CREATE INDEX idx_job_created_at ON job (created_at);
CREATE INDEX idx_job_farm_house ON job (farm_id, house_id, created_at);
CREATE INDEX idx_job_status ON job (status);

CREATE TABLE job_attachment (
  job_id   TEXT NOT NULL REFERENCES job (job_id) ON DELETE CASCADE,
  file_id  TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (job_id, file_id)
);

CREATE INDEX idx_job_attachment_file ON job_attachment (file_id);

/* ------------------------------ 会话 ------------------------------ */

CREATE TABLE session (
  session_id        TEXT PRIMARY KEY,
  job_id            TEXT NOT NULL REFERENCES job (job_id) ON DELETE RESTRICT,
  device_id         TEXT NOT NULL REFERENCES device (device_id) ON DELETE RESTRICT,
  operator_id       TEXT NOT NULL,
  started_at        TEXT NOT NULL,
  ended_at          TEXT,
  status            TEXT NOT NULL CHECK (status IN ('active', 'ended', 'aborted')),
  clock_quality     TEXT NOT NULL CHECK (clock_quality IN ('synced', 'unsynced', 'drift')),
  clock_offset_ms   REAL,
  score_status      TEXT NOT NULL CHECK (score_status IN ('provisional', 'final', 'unavailable')),
  score_value       REAL CHECK (score_value IS NULL OR (score_value >= 0 AND score_value <= 100)),
  valid_event_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_event_count >= 0),
  coverage          REAL NOT NULL DEFAULT 0 CHECK (coverage >= 0 AND coverage <= 1),
  rule_version      TEXT NOT NULL,
  model_version     TEXT NOT NULL,
  score_version     INTEGER NOT NULL CHECK (score_version >= 1),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_session_job ON session (job_id);
CREATE INDEX idx_session_device ON session (device_id, started_at);
CREATE INDEX idx_session_status ON session (status);

-- 评分版本历史：人工复核、重新分析都另存版本，不覆盖旧分
CREATE TABLE session_score_version (
  session_id        TEXT NOT NULL REFERENCES session (session_id) ON DELETE CASCADE,
  score_version     INTEGER NOT NULL CHECK (score_version >= 1),
  status            TEXT NOT NULL CHECK (status IN ('provisional', 'final', 'unavailable')),
  value             REAL CHECK (value IS NULL OR (value >= 0 AND value <= 100)),
  valid_event_count INTEGER NOT NULL CHECK (valid_event_count >= 0),
  coverage          REAL NOT NULL CHECK (coverage >= 0 AND coverage <= 1),
  rule_version      TEXT NOT NULL,
  model_version     TEXT NOT NULL,
  recorded_at       TEXT NOT NULL,
  reason            TEXT NOT NULL
                    CHECK (reason IN ('initial', 'provisional', 'final', 'review', 'reanalysis')),
  PRIMARY KEY (session_id, score_version)
);

/* ------------------------------ 事件 ------------------------------ */

CREATE TABLE event (
  event_id            TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES session (session_id) ON DELETE CASCADE,
  device_monotonic_ms REAL NOT NULL CHECK (device_monotonic_ms >= 0),
  utc                 TEXT NOT NULL,
  action              TEXT NOT NULL,
  confidence          REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rule_id             TEXT,
  evaluability        TEXT NOT NULL
                      CHECK (evaluability IN ('evaluable', 'low_confidence', 'not_evaluable')),
  clip_start_ms       REAL NOT NULL CHECK (clip_start_ms >= 0),
  clip_end_ms         REAL NOT NULL CHECK (clip_end_ms >= 0),
  review_conclusion   TEXT NOT NULL
                      CHECK (review_conclusion IN ('pending', 'confirmed', 'rejected', 'supplemented')),
  reviewer_id         TEXT,
  reviewed_at         TEXT,
  review_remark       TEXT,
  created_at          TEXT NOT NULL,
  CHECK (clip_end_ms >= clip_start_ms)
);

CREATE INDEX idx_event_session_time ON event (session_id, device_monotonic_ms);
CREATE INDEX idx_event_review ON event (review_conclusion);

-- 每条复核结论留痕；event 表保存最新结论，原始 AI 判定字段不被复核覆盖
CREATE TABLE event_review_log (
  event_id    TEXT NOT NULL REFERENCES event (event_id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL CHECK (seq >= 1),
  conclusion  TEXT NOT NULL
              CHECK (conclusion IN ('pending', 'confirmed', 'rejected', 'supplemented')),
  reviewer_id TEXT,
  reviewed_at TEXT,
  remark      TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (event_id, seq)
);

/* ------------------------------ 指令 ------------------------------ */

CREATE TABLE command (
  command_id             TEXT PRIMARY KEY,
  device_id              TEXT NOT NULL REFERENCES device (device_id) ON DELETE RESTRICT,
  session_id             TEXT REFERENCES session (session_id) ON DELETE SET NULL,
  expected_state_version INTEGER NOT NULL CHECK (expected_state_version >= 0),
  action                 TEXT NOT NULL
                         CHECK (action IN ('start_job', 'pause_job', 'resume_job', 'end_job',
                                           'snapshot', 'sync_time', 'reboot')),
  issued_at              TEXT NOT NULL,
  expires_at             TEXT NOT NULL,
  result_state           TEXT NOT NULL
                         CHECK (result_state IN ('accepted', 'completed', 'rejected', 'timeout', 'failed')),
  result_code            TEXT,
  result_message         TEXT,
  finished_at            TEXT,
  created_at             TEXT NOT NULL,
  CHECK (expires_at >= issued_at)
);

CREATE INDEX idx_command_device ON command (device_id, issued_at);
CREATE INDEX idx_command_state ON command (result_state, expires_at);

/* ------------------------------ 上传 ------------------------------ */

CREATE TABLE upload (
  file_id           TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  job_id            TEXT REFERENCES job (job_id) ON DELETE SET NULL,
  session_id        TEXT REFERENCES session (session_id) ON DELETE SET NULL,
  kind              TEXT NOT NULL
                    CHECK (kind IN ('job_meta', 'event_log', 'screenshot', 'event_clip', 'full_recording')),
  size_bytes        INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256            TEXT NOT NULL
                    CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  uploaded_bytes    INTEGER NOT NULL DEFAULT 0 CHECK (uploaded_bytes >= 0),
  chunk_size        INTEGER NOT NULL CHECK (chunk_size >= 1),
  total_chunks      INTEGER NOT NULL CHECK (total_chunks >= 0),
  uploaded_chunks   INTEGER NOT NULL CHECK (uploaded_chunks >= 0),
  status            TEXT NOT NULL
                    CHECK (status IN ('pending', 'uploading', 'failed', 'verified', 'archived')),
  receipt_id        TEXT,
  receipt_verified_at TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error        TEXT,
  -- 管理服务本地文件位置；不属于契约字段
  storage_path      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,

  CHECK (uploaded_chunks <= total_chunks),
  CHECK (uploaded_bytes <= size_bytes),
  CHECK (
    (receipt_id IS NULL AND receipt_verified_at IS NULL)
    OR (receipt_id IS NOT NULL AND receipt_verified_at IS NOT NULL)
  ),
  -- 无云端校验回执不得显示已归档
  CHECK (status <> 'archived' OR receipt_id IS NOT NULL)
);

CREATE INDEX idx_upload_status ON upload (status, created_at);
CREATE INDEX idx_upload_job ON upload (job_id);
CREATE INDEX idx_upload_session ON upload (session_id);

/* --------------------------- 服务支撑表 --------------------------- */

-- 写接口幂等：同一 scope + key + 请求指纹只产生一次副作用
CREATE TABLE idempotency_key (
  scope         TEXT NOT NULL,
  key           TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  status_code   INTEGER,
  response_json TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);

CREATE INDEX idx_idempotency_expires ON idempotency_key (expires_at);

-- 配对、远程指令、复核、导出等敏感操作留痕
CREATE TABLE audit_log (
  audit_id    TEXT PRIMARY KEY,
  actor_id    TEXT,
  actor_role  TEXT CHECK (actor_role IS NULL OR actor_role IN ('viewer', 'operator', 'admin')),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT,
  detail_json TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_audit_created_at ON audit_log (created_at);
CREATE INDEX idx_audit_target ON audit_log (target_type, target_id);