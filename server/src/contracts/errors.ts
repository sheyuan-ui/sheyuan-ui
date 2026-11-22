/**
 *  vendored：sheyuan-ui/sheyuan-ui @ 9ea16e1  src/contracts/errors.ts
 *
 * T02 错误码表：前端按 code 分支，不比对中文文案 */

export const ERROR_CODES = {
  INVALID_ARGUMENT: { http: 400, message: "参数不合法" },
  UNAUTHORIZED: { http: 401, message: "未登录或令牌已过期" },
  FORBIDDEN: { http: 403, message: "无权执行该操作" },
  NOT_FOUND: { http: 404, message: "资源不存在" },
  CONFLICT: { http: 409, message: "状态已变化，请刷新后重试" },
  DEVICE_REJECTED: { http: 409, message: "设备拒绝执行" },
  COMMAND_EXPIRED: { http: 410, message: "指令已过期" },
  PAYLOAD_TOO_LARGE: { http: 413, message: "文件超出大小限制" },
  UNSUPPORTED_MEDIA_TYPE: { http: 415, message: "不支持的文件类型" },
  UPLOAD_HASH_MISMATCH: { http: 422, message: "文件校验失败" },
  RATE_LIMITED: { http: 429, message: "请求过于频繁" },
  DEVICE_UNREACHABLE: { http: 502, message: "设备当前不可达" },
  INTERNAL: { http: 500, message: "服务内部错误" },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ApiError {
  code: ErrorCode;
  message: string;
  /** 字段级错误或冲突详情，便于前端定位 */
  details?: Record<string, string>;
  request_id: string;
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && code in ERROR_CODES;
}
