import { ERROR_CODES, isApiError, type ErrorCode } from "../contracts/errors";
import { ApiRequestError } from "./errors";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  saveTokenPair,
  type TokenPair,
} from "./session";

/**
 * 本地 mock 开关：默认开启，保证没有后端也能演示登录。
 * 联调真实接口时设 VITE_USE_MOCK=false（见 .env.example）。
 */
const useMockRaw = (import.meta.env.VITE_USE_MOCK ?? "true").trim().toLowerCase();
export const USE_MOCK = useMockRaw !== "false";

/** 管理服务地址；留空走同源，开发时由 Vite 代理 /api */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export const AUTH_PATHS = {
  login: "/api/auth/login",
  refresh: "/api/auth/refresh",
  logout: "/api/auth/logout",
} as const;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  /** 请求体，自动 JSON 序列化并带上 Content-Type */
  json?: unknown;
  /** 默认 true：有访问令牌就带 Authorization */
  auth?: boolean;
  /** 写接口默认自动生成；重试时沿用同一个 */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

const WRITE_METHODS: readonly HttpMethod[] = ["POST", "PUT", "PATCH", "DELETE"];

function newIdempotencyKey(): string {
  // 局域网 http 下 crypto.randomUUID 不是安全上下文，需回落
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function httpStatusToCode(status: number): ErrorCode {
  for (const [code, meta] of Object.entries(ERROR_CODES)) {
    if (meta.http === status) return code as ErrorCode;
  }
  return status >= 500 ? "INTERNAL" : "INVALID_ARGUMENT";
}

function toRequestError(body: unknown, status: number): ApiRequestError {
  if (isApiError(body)) {
    return new ApiRequestError(body.code, body.message, {
      status,
      details: body.details,
      requestId: body.request_id,
    });
  }
  return new ApiRequestError(httpStatusToCode(status), undefined, { status });
}

function unwrap<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function perform(
  path: string,
  options: RequestOptions,
): Promise<{ res: Response; body: unknown }> {
  const method = options.method ?? (options.json === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { Accept: "application/json" };

  if (options.json !== undefined) headers["Content-Type"] = "application/json";

  const token = getAccessToken();
  if (options.auth !== false && token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (WRITE_METHODS.includes(method)) {
    headers["Idempotency-Key"] = options.idempotencyKey ?? newIdempotencyKey();
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError("NETWORK", undefined, { status: 0 });
  }

  return { res, body: await readBody(res) };
}

const unauthorizedListeners = new Set<() => void>();

/** 注册 401 且无法刷新时的回调；返回取消注册函数。 */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) listener();
}

let refreshInFlight: Promise<boolean> | null = null;

/** 用刷新令牌换新的令牌对；并发 401 只发一次刷新请求。 */
export function refreshSession(): Promise<boolean> {
  if (USE_MOCK) return Promise.resolve(false);
  if (refreshInFlight !== null) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (refreshToken === null) return Promise.resolve(false);

  refreshInFlight = (async () => {
    try {
      const { res, body } = await perform(AUTH_PATHS.refresh, {
        method: "POST",
        json: { refresh_token: refreshToken },
        auth: false,
      });
      if (!res.ok) throw toRequestError(body, res.status);
      saveTokenPair(unwrap<TokenPair>(body));
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return run<T>(path, options, true);
}

async function run<T>(
  path: string,
  options: RequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const method = options.method ?? (options.json === undefined ? "GET" : "POST");
  const prepared: RequestOptions = { ...options, method };
  if (WRITE_METHODS.includes(method) && prepared.idempotencyKey === undefined) {
    // 401 后重试沿用同一个键，避免服务端把重试当成新写入
    prepared.idempotencyKey = newIdempotencyKey();
  }

  const { res, body } = await perform(path, prepared);
  if (res.ok) return unwrap<T>(body);

  const error = toRequestError(body, res.status);

  if (res.status === 401 && prepared.auth !== false) {
    const isAuthPath = path.startsWith("/api/auth/");
    if (allowRefresh && !isAuthPath && (await refreshSession())) {
      return run<T>(path, prepared, false);
    }
    clearSession();
    notifyUnauthorized();
  }

  throw error;
}