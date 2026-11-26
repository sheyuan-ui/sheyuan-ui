import { ERROR_CODES, type ErrorCode } from "../contracts/errors";

/** 服务端错误码 + 前端本地判定的网络错误 */
export type ApiErrorCode = ErrorCode | "NETWORK";

interface ApiRequestErrorOptions {
  status?: number;
  details?: Record<string, string>;
  requestId?: string;
}

/**
 * 统一的请求失败对象：分支只看 code，文案直接展示 message。
 * 服务端返回的 message 优先，缺失时回落到 T02 错误码表的中文说明。
 */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, string> | undefined;
  readonly requestId: string;

  constructor(code: ApiErrorCode, message?: string, options: ApiRequestErrorOptions = {}) {
    super(message ?? defaultMessage(code));
    this.name = "ApiRequestError";
    this.code = code;
    this.status = options.status ?? 0;
    this.details = options.details;
    this.requestId = options.requestId ?? "";
  }
}

function defaultMessage(code: ApiErrorCode): string {
  if (code === "NETWORK") return "无法连接服务器，请检查服务是否启动";
  return ERROR_CODES[code].message;
}

export function isApiRequestError(value: unknown): value is ApiRequestError {
  return value instanceof ApiRequestError;
}