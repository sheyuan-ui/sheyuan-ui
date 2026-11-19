/**
 * T02 六对象 JSON Schema（draft-07）。
 * TS 类型管编译期，Schema 管运行期：后端返回的 JSON 用这份规则校验。
 * 字段与 types.ts 一一对应；改动必须两边同步。
 * 未知值用 null，不用 0 或空串顶替；枚举值不得擅自增删。
 */

const dateTime = { type: ["string", "null"] as const, format: "date-time" };

export const deviceStatusSchema = {
  $id: "DeviceStatus",
  type: "object",
  additionalProperties: false,
  required: [
    "device_id",
    "model",
    "firmware_version",
    "battery_pct",
    "wifi",
    "hub_reachable",
    "cloud_reachable",
    "task_state",
    "storage_free_bytes",
    "last_seen",
    "state_version",
  ],
  properties: {
    device_id: { type: "string", minLength: 1 },
    model: { type: "string" },
    firmware_version: { type: "string" },
    /** 未知为 null；0 是有效值，不代表未知 */
    battery_pct: { type: ["number", "null"], minimum: 0, maximum: 100 },
    wifi: {
      type: "object",
      additionalProperties: false,
      required: ["connected", "ssid", "rssi_dbm"],
      properties: {
        connected: { type: "boolean" },
        ssid: { type: ["string", "null"] },
        rssi_dbm: { type: ["number", "null"] },
      },
    },
    hub_reachable: { type: "boolean" },
    cloud_reachable: { type: "boolean" },
    task_state: {
      enum: ["idle", "starting", "recording", "paused", "stopping", "error"],
    },
    storage_free_bytes: { type: "integer", minimum: 0 },
    last_seen: { type: "string", format: "date-time" },
    state_version: { type: "integer", minimum: 0 },
  },
} as const;

export const jobSchema = {
  $id: "Job",
  type: "object",
  additionalProperties: false,
  required: [
    "job_id",
    "farm_id",
    "house_id",
    "scenario",
    "batch_id",
    "owner_name",
    "location",
    "attachment_ids",
    "status",
    "remark",
    "created_at",
  ],
  properties: {
    job_id: { type: "string", minLength: 1 },
    farm_id: { type: "string" },
    house_id: { type: "string" },
    scenario: { enum: ["broiler", "layer"] },
    batch_id: { type: "string" },
    owner_name: { type: "string" },
    location: {
      type: "object",
      additionalProperties: false,
      required: ["farm_id", "farm_name", "house_id", "house_name", "geo"],
      properties: {
        farm_id: { type: "string" },
        farm_name: { type: "string" },
        house_id: { type: "string" },
        house_name: { type: "string" },
        /** 定位失败或未授权为 null，不阻止创建任务 */
        geo: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["lat", "lng", "accuracy_m", "source", "captured_at"],
          properties: {
            lat: { type: "number", minimum: -90, maximum: 90 },
            lng: { type: "number", minimum: -180, maximum: 180 },
            accuracy_m: { type: "number", minimum: 0 },
            source: { enum: ["ipad_gps", "manual"] },
            captured_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
    attachment_ids: { type: "array", items: { type: "string" } },
    status: {
      enum: ["created", "dispatched", "running", "paused", "completed", "cancelled"],
    },
    remark: { type: ["string", "null"] },
    created_at: { type: "string", format: "date-time" },
  },
} as const;

export const sessionSchema = {
  $id: "Session",
  type: "object",
  additionalProperties: false,
  required: [
    "session_id",
    "job_id",
    "device_id",
    "operator_id",
    "started_at",
    "ended_at",
    "status",
    "clock_quality",
    "clock_offset_ms",
    "score",
  ],
  properties: {
    session_id: { type: "string", minLength: 1 },
    job_id: { type: "string" },
    device_id: { type: "string" },
    operator_id: { type: "string" },
    started_at: { type: "string", format: "date-time" },
    ended_at: dateTime,
    status: { enum: ["active", "ended", "aborted"] },
    /** 未校时不得声称帧级同步 */
    clock_quality: { enum: ["synced", "unsynced", "drift"] },
    clock_offset_ms: { type: ["number", "null"] },
    score: {
      type: "object",
      additionalProperties: false,
      required: [
        "status",
        "value",
        "valid_event_count",
        "coverage",
        "rule_version",
        "model_version",
        "score_version",
      ],
      properties: {
        status: { enum: ["provisional", "final", "unavailable"] },
        /** 数据不足为 null，界面显示 --，不默认 100 */
        value: { type: ["number", "null"], minimum: 0, maximum: 100 },
        valid_event_count: { type: "integer", minimum: 0 },
        coverage: { type: "number", minimum: 0, maximum: 1 },
        rule_version: { type: "string" },
        model_version: { type: "string" },
        score_version: { type: "integer", minimum: 1 },
      },
    },
  },
} as const;

export const eventSchema = {
  $id: "Event",
  type: "object",
  additionalProperties: false,
  required: [
    "event_id",
    "session_id",
    "time",
    "action",
    "confidence",
    "rule_id",
    "evaluability",
    "clip",
    "review",
  ],
  properties: {
    event_id: { type: "string", minLength: 1 },
    session_id: { type: "string" },
    time: {
      type: "object",
      additionalProperties: false,
      required: ["device_monotonic_ms", "utc"],
      properties: {
        /** 设备单调时钟，与视频共用 */
        device_monotonic_ms: { type: "number", minimum: 0 },
        utc: { type: "string", format: "date-time" },
      },
    },
    action: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rule_id: { type: ["string", "null"] },
    evaluability: { enum: ["evaluable", "low_confidence", "not_evaluable"] },
    clip: {
      type: "object",
      additionalProperties: false,
      required: ["start_ms", "end_ms"],
      properties: {
        start_ms: { type: "number", minimum: 0 },
        end_ms: { type: "number", minimum: 0 },
      },
    },
    review: {
      type: "object",
      additionalProperties: false,
      required: ["conclusion", "reviewer_id", "reviewed_at", "remark"],
      properties: {
        conclusion: { enum: ["pending", "confirmed", "rejected", "supplemented"] },
        reviewer_id: { type: ["string", "null"] },
        reviewed_at: dateTime,
        remark: { type: ["string", "null"] },
      },
    },
  },
} as const;

export const commandSchema = {
  $id: "Command",
  type: "object",
  additionalProperties: false,
  required: [
    "command_id",
    "device_id",
    "session_id",
    "expected_state_version",
    "action",
    "issued_at",
    "expires_at",
    "result",
  ],
  properties: {
    command_id: { type: "string", minLength: 1 },
    device_id: { type: "string" },
    session_id: { type: ["string", "null"] },
    /** 乐观锁：与设备状态版本不一致返回 409 */
    expected_state_version: { type: "integer", minimum: 0 },
    action: {
      enum: [
        "start_job",
        "pause_job",
        "resume_job",
        "end_job",
        "snapshot",
        "sync_time",
        "reboot",
      ],
    },
    issued_at: { type: "string", format: "date-time" },
    expires_at: { type: "string", format: "date-time" },
    result: {
      type: "object",
      additionalProperties: false,
      required: ["state", "code", "message", "finished_at"],
      properties: {
        /** 超时与拒绝必须可区分 */
        state: { enum: ["accepted", "completed", "rejected", "timeout", "failed"] },
        code: { type: ["string", "null"] },
        message: { type: ["string", "null"] },
        finished_at: dateTime,
      },
    },
  },
} as const;

export const uploadSchema = {
  $id: "Upload",
  type: "object",
  additionalProperties: false,
  required: [
    "file_id",
    "owner_id",
    "job_id",
    "session_id",
    "kind",
    "size_bytes",
    "sha256",
    "progress",
    "status",
    "cloud_receipt",
    "attempts",
    "last_error",
  ],
  properties: {
    file_id: { type: "string", minLength: 1 },
    owner_id: { type: "string" },
    job_id: { type: ["string", "null"] },
    session_id: { type: ["string", "null"] },
    kind: {
      enum: ["job_meta", "event_log", "screenshot", "event_clip", "full_recording"],
    },
    size_bytes: { type: "integer", minimum: 0 },
    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    progress: {
      type: "object",
      additionalProperties: false,
      required: ["uploaded_bytes", "chunk_size", "total_chunks", "uploaded_chunks"],
      properties: {
        uploaded_bytes: { type: "integer", minimum: 0 },
        chunk_size: { type: "integer", minimum: 1 },
        total_chunks: { type: "integer", minimum: 0 },
        uploaded_chunks: { type: "integer", minimum: 0 },
      },
    },
    status: { enum: ["pending", "uploading", "failed", "verified", "archived"] },
    /** 无回执不得显示已归档 */
    cloud_receipt: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["receipt_id", "verified_at"],
      properties: {
        receipt_id: { type: "string" },
        verified_at: { type: "string", format: "date-time" },
      },
    },
    attempts: { type: "integer", minimum: 0 },
    last_error: { type: ["string", "null"] },
  },
} as const;

/** 六对象统一入口，测试与运行期校验共用 */
export const SCHEMAS = {
  deviceStatus: deviceStatusSchema,
  job: jobSchema,
  session: sessionSchema,
  event: eventSchema,
  command: commandSchema,
  upload: uploadSchema,
} as const;

export type SchemaName = keyof typeof SCHEMAS;
