/**
 *  vendored：sheyuan-ui/sheyuan-ui @ 9ea16e1  src/contracts/types.ts
 *  契约唯一来源在上游仓库；此处只读复制，不在本仓库单方面修改字段。
 *
 * T02 数据契约：设备、任务、会话、事件、指令、上传
 * 字段与《总体设计说明 V1.0》§7.7 对齐，前端、管理服务、设备三方共用。
 * 统一 snake_case，便于直接序列化入库与接口传输；时间统一 UTC ISO 8601。
 */

export type ISODateTime = string;
export type DeviceId = string;
export type JobId = string;
export type SessionId = string;
export type EventId = string;
export type CommandId = string;
export type FileId = string;

/* ------------------------------ 设备 ------------------------------ */

/** 设备自身任务态，由设备上报；在线/离线/故障由心跳推导（T07），不写进原始数据 */
export type DeviceTaskState =
  | "idle"
  | "starting"
  | "recording"
  | "paused"
  | "stopping"
  | "error";

export interface WifiStatus {
  connected: boolean;
  ssid: string | null;
  /** dBm，未知为 null */
  rssi_dbm: number | null;
}

export interface DeviceStatus {
  device_id: DeviceId;
  model: string;
  firmware_version: string;
  /** 0–100，未知为 null，不可用 0 代替 */
  battery_pct: number | null;
  wifi: WifiStatus;
  /** 管理服务能否访问到设备 */
  hub_reachable: boolean;
  cloud_reachable: boolean;
  task_state: DeviceTaskState;
  storage_free_bytes: number;
  /** 设备上报时刻（UTC），用于离线判定与旧帧标记 */
  last_seen: ISODateTime;
  /** 乐观锁版本，每次状态变更 +1 */
  state_version: number;
}

/* ------------------------------ 任务 ------------------------------ */

export type Scenario = "broiler" | "layer";

export type JobStatus =
  | "created"
  | "dispatched"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy_m: number;
  /** 坐标来源；不代表每台头盔的实时位置 */
  source: "ipad_gps" | "manual";
  captured_at: ISODateTime;
}

export interface LocationSnapshot {
  farm_id: string;
  farm_name: string;
  house_id: string;
  house_name: string;
  /** 室内定位失败或未授权时为 null，不阻止创建任务 */
  geo: GeoPoint | null;
}

export interface Job {
  job_id: JobId;
  farm_id: string;
  house_id: string;
  scenario: Scenario;
  batch_id: string;
  owner_name: string;
  /** 创建时固化，后续场区档案变更不影响历史记录 */
  location: LocationSnapshot;
  attachment_ids: FileId[];
  status: JobStatus;
  remark: string | null;
  created_at: ISODateTime;
}

/* ------------------------------ 会话 ------------------------------ */

export type SessionStatus = "active" | "ended" | "aborted";

/** 校时质量；未校时不得声称帧级同步 */
export type ClockQuality = "synced" | "unsynced" | "drift";

export type ScoreStatus = "provisional" | "final" | "unavailable";

export interface SessionScore {
  status: ScoreStatus;
  /** 0–100；数据不足为 null，界面显示 “--”，不默认 100 */
  value: number | null;
  valid_event_count: number;
  /** 规则覆盖率 0–1 */
  coverage: number;
  rule_version: string;
  model_version: string;
  /** 人工复核导致评分变化时递增，另存版本 */
  score_version: number;
}

export interface Session {
  session_id: SessionId;
  job_id: JobId;
  device_id: DeviceId;
  operator_id: string;
  started_at: ISODateTime;
  ended_at: ISODateTime | null;
  status: SessionStatus;
  clock_quality: ClockQuality;
  /** 与 UTC 的偏差（毫秒），未校时为 null */
  clock_offset_ms: number | null;
  score: SessionScore;
}

/* ------------------------------ 评估报告 ------------------------------ */

/** 算法侧计分状态；与 SessionScore.status 语义不同，报告原样保存 */
export type EvaluationScoreStatus = "scoring_not_defined" | "insufficient_data" | "scored";

export type RuleResultOutcome = "compliant" | "noncompliant" | "unknown" | "not_applicable";

export interface RuleResult {
  rule_id: string;
  rule_name: string;
  result: RuleResultOutcome;
  /** 违规发生时间，距本轮开始的秒数；无违规则为 null */
  violation_time_seconds: number | null;
  score: number | null;
  /** 因本条规则被扣除的分值 */
  deducted_points: number | null;
  reason: string;
}

export interface OperationResult {
  operation_id: string;
  /** 距本轮开始的秒数 */
  start_time_seconds: number;
  end_time_seconds: number | null;
  score: number | null;
  rule_results: RuleResult[];
}

/** 算法侧评分输出：一轮作业（会话）一份，按 score_version 留档 */
export interface EvaluationReport {
  task_id: SessionId;
  scene: Scenario;
  total_score: number | null;
  score_status: EvaluationScoreStatus;
  operations: OperationResult[];
  /** 服务端生成：与 session.score 的版本一致 */
  score_version: number;
  received_at: ISODateTime;
}

export type EvaluationReportInput = Omit<EvaluationReport, "score_version" | "received_at">;

/* ------------------------------ 事件 ------------------------------ */

export interface EventTime {
  /** 设备单调时钟，与视频共用；恢复网络后不改写片段内时间轴 */
  device_monotonic_ms: number;
  /** 对应 UTC，仅用于跨设备展示 */
  utc: ISODateTime;
}

export interface EventClip {
  start_ms: number;
  end_ms: number;
}

export type Evaluability = "evaluable" | "low_confidence" | "not_evaluable";

export type ReviewConclusion = "pending" | "confirmed" | "rejected" | "supplemented";

export interface EventReview {
  conclusion: ReviewConclusion;
  reviewer_id: string | null;
  reviewed_at: ISODateTime | null;
  remark: string | null;
}

export interface Event {
  event_id: EventId;
  session_id: SessionId;
  time: EventTime;
  action: string;
  /** 0–1 */
  confidence: number;
  rule_id: string | null;
  evaluability: Evaluability;
  clip: EventClip;
  review: EventReview;
}

/* ------------------------------ 指令 ------------------------------ */

export type CommandAction =
  | "start_job"
  | "pause_job"
  | "resume_job"
  | "end_job"
  | "snapshot"
  | "sync_time"
  | "reboot";

/** 五种结果，超时与拒绝必须可区分，否则界面无法给出正确提示 */
export type CommandOutcome =
  | "accepted"
  | "completed"
  | "rejected"
  | "timeout"
  | "failed";

export interface CommandResult {
  state: CommandOutcome;
  /** 设备返回的错误码，成功为 null */
  code: string | null;
  message: string | null;
  finished_at: ISODateTime | null;
}

export interface Command {
  command_id: CommandId;
  device_id: DeviceId;
  session_id: SessionId | null;
  /** 下发时设备的状态版本，不匹配返回 409，防按键与网页同时操作 */
  expected_state_version: number;
  action: CommandAction;
  issued_at: ISODateTime;
  expires_at: ISODateTime;
  result: CommandResult;
}

/* ------------------------------ 上传 ------------------------------ */

export type UploadKind =
  | "job_meta"
  | "event_log"
  | "screenshot"
  | "event_clip"
  | "full_recording";

export type UploadStatus =
  | "pending"
  | "uploading"
  | "failed"
  | "verified"
  | "archived";

export interface UploadProgress {
  uploaded_bytes: number;
  chunk_size: number;
  total_chunks: number;
  uploaded_chunks: number;
}

export interface CloudReceipt {
  receipt_id: string;
  verified_at: ISODateTime;
}

export interface Upload {
  file_id: FileId;
  /** 文件持有者：设备或管理服务 */
  owner_id: string;
  job_id: JobId | null;
  session_id: SessionId | null;
  kind: UploadKind;
  size_bytes: number;
  sha256: string;
  progress: UploadProgress;
  status: UploadStatus;
  /** 校验成功回执；为空不得显示“已归档” */
  cloud_receipt: CloudReceipt | null;
  attempts: number;
  last_error: string | null;
}

/* ------------------------------ 通用 ------------------------------ */

export interface PageQuery {
  page: number;
  page_size: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface ApiResponse<T> {
  data: T;
  request_id: string;
}
