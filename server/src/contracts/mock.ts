/**
 *  vendored：sheyuan-ui/sheyuan-ui @ 9ea16e1  src/contracts/mock.ts
 *  契约样例，本仓库用于种子数据与往返测试。
 *
 * T02 mock 样例：真实接口就绪前，前端直接用这份数据填页面。
 * 字段与后端完全一致，切换真实接口时只替换数据来源。
 */

import type { Command, DeviceStatus, Event, Job, Session, Upload } from "./types.ts";

export const mockDeviceStatus: DeviceStatus = {
  device_id: "edge-01",
  model: "SY-Helmet Edge",
  firmware_version: "v1.4.2",
  battery_pct: 86,
  wifi: { connected: true, ssid: "SY-FIELD-A", rssi_dbm: -52 },
  hub_reachable: true,
  cloud_reachable: false,
  task_state: "recording",
  storage_free_bytes: 31_204_147_200,
  last_seen: "2026-11-18T10:31:07Z",
  state_version: 42,
};

export const mockJob: Job = {
  job_id: "job-20261118-001",
  farm_id: "farm-01",
  house_id: "house-a3",
  scenario: "broiler",
  batch_id: "BATCH-2026-11-A3",
  owner_name: "张伟",
  location: {
    farm_id: "farm-01",
    farm_name: "一号场区",
    house_id: "house-a3",
    house_name: "A3 栋",
    geo: {
      lat: 31.2304,
      lng: 121.4737,
      accuracy_m: 8.5,
      source: "ipad_gps",
      captured_at: "2026-11-18T09:58:12Z",
    },
  },
  attachment_ids: ["file-attach-001"],
  status: "running",
  remark: "第三次进场，注意东侧饮水线",
  created_at: "2026-11-18T09:58:20Z",
};

export const mockSession: Session = {
  session_id: "sess-20261118-0007",
  job_id: "job-20261118-001",
  device_id: "edge-01",
  operator_id: "user-huangqx",
  started_at: "2026-11-18T10:02:00Z",
  ended_at: null,
  status: "active",
  clock_quality: "synced",
  clock_offset_ms: 12,
  score: {
    status: "provisional",
    value: 78,
    valid_event_count: 24,
    coverage: 0.82,
    rule_version: "rule-broiler-v1.3",
    model_version: "model-grab-v2.1",
    score_version: 1,
  },
};

export const mockEvent: Event = {
  event_id: "evt-20261118-0132",
  session_id: "sess-20261118-0007",
  time: { device_monotonic_ms: 128_450, utc: "2026-11-18T10:04:08Z" },
  action: "grab",
  confidence: 0.91,
  rule_id: "rule-broiler-grab-visibility",
  evaluability: "evaluable",
  clip: { start_ms: 126_000, end_ms: 131_000 },
  review: {
    conclusion: "pending",
    reviewer_id: null,
    reviewed_at: null,
    remark: null,
  },
};

export const mockCommand: Command = {
  command_id: "cmd-20261118-0055",
  device_id: "edge-01",
  session_id: "sess-20261118-0007",
  expected_state_version: 42,
  action: "pause_job",
  issued_at: "2026-11-18T10:31:02Z",
  expires_at: "2026-11-18T10:31:12Z",
  result: {
    state: "completed",
    code: null,
    message: null,
    finished_at: "2026-11-18T10:31:03Z",
  },
};

export const mockUpload: Upload = {
  file_id: "file-clip-0132",
  owner_id: "edge-01",
  job_id: "job-20261118-001",
  session_id: "sess-20261118-0007",
  kind: "event_clip",
  size_bytes: 18_874_368,
  sha256: "9f2c4e1b7a5d0c3e8b6f1a2d4c5e7f9012345678abcdef0123456789abcdef01",
  progress: {
    uploaded_bytes: 9_437_184,
    chunk_size: 4_194_304,
    total_chunks: 5,
    uploaded_chunks: 2,
  },
  status: "uploading",
  cloud_receipt: null,
  attempts: 1,
  last_error: null,
};

/** 前端 mock 层一次性取用 */
export const MOCK_CONTRACT = {
  deviceStatus: mockDeviceStatus,
  job: mockJob,
  session: mockSession,
  event: mockEvent,
  command: mockCommand,
  upload: mockUpload,
} as const;
