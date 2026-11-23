/**
 *  vendored：sheyuan-ui/sheyuan-ui @ 9ea16e1，T05 增补设备注册与心跳路径
 *  路由与 WS 主题以本文件为准，不在实现里另写字符串。
 *
 * T02 接口路径清单
 * 浏览器只调用管理服务，不向整个网段广播；设备细节由管理服务代理。
 */

export const API = {
  /* 设备与配对 */
  devices: "/api/devices",
  device: (id: string) => `/api/devices/${id}`,
  deviceStatus: (id: string) => `/api/devices/${id}/status`,
  deviceSessions: (id: string) => `/api/devices/${id}/sessions`,
  /** 设备侧：注册（X-Device-Token 鉴权，不走用户角色） */
  deviceRegister: "/api/devices/register",
  /** 设备侧：心跳上报 */
  deviceHeartbeat: (id: string) => `/api/devices/${id}/heartbeat`,
  pairCode: "/api/devices/pair-code",
  pair: "/api/devices/pair",
  previewOffer: (deviceId: string) => `/api/devices/${deviceId}/preview/offer`,

  /* 任务与附件 */
  jobs: "/api/jobs",
  job: (id: string) => `/api/jobs/${id}`,
  jobAttachments: (id: string) => `/api/jobs/${id}/attachments`,

  /* 会话与事件 */
  sessions: "/api/sessions",
  session: (id: string) => `/api/sessions/${id}`,
  sessionEvents: (id: string) => `/api/sessions/${id}/events`,
  eventReview: (id: string) => `/api/events/${id}/review`,

  /* 指令 */
  commands: "/api/commands",
  command: (id: string) => `/api/commands/${id}`,

  /* 上传 */
  uploads: "/api/uploads",
  upload: (id: string) => `/api/uploads/${id}`,
  uploadChunks: (id: string) => `/api/uploads/${id}/chunks`,
  uploadComplete: (id: string) => `/api/uploads/${id}/complete`,
} as const;

/** WebSocket 订阅主题，由管理服务推送 */
export const WS_TOPICS = {
  deviceStatus: "device.status",
  deviceEvents: "device.events",
  commandResult: "command.result",
  uploadProgress: "upload.progress",
} as const;

/** 写接口必须携带的幂等头；重试不得产生重复任务或重复指令 */
export const HEADERS = {
  idempotencyKey: "Idempotency-Key",
  requestId: "X-Request-Id",
  auth: "Authorization",
} as const;
