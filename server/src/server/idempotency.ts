import { createHash } from "node:crypto";
import type { RouteResult, RequestContext } from "./router.ts";
import { readHeader } from "./headers.ts";
import { HttpError } from "./http-errors.ts";

export function requestFingerprint(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function requireIdempotencyKey(ctx: RequestContext): string {
  const key = readHeader(ctx.req.headers, "idempotency-key");
  if (key === undefined) {
    throw new HttpError("INVALID_ARGUMENT", "写接口必须携带 Idempotency-Key");
  }
  return key;
}

/**
 * 写接口幂等外壳：同键同指纹重放首次响应，同键不同指纹冲突。
 * 只有 2xx 响应会被记住；异常时释放占位，允许客户端重试。
 */
export async function withIdempotency(
  ctx: RequestContext,
  scope: string,
  requestHash: string,
  run: () => Promise<RouteResult> | RouteResult,
  options: { onReplay?: () => void } = {},
): Promise<RouteResult> {
  const key = requireIdempotencyKey(ctx);
  const reservation = ctx.repos.idempotency.reserve(scope, key, requestHash);

  if (reservation.kind === "conflict") {
    throw new HttpError("CONFLICT", "Idempotency-Key 已用于不同请求");
  }
  if (reservation.kind === "in_progress") {
    throw new HttpError("CONFLICT", "同一请求正在处理，请稍后重试");
  }
  if (reservation.kind === "replay") {
    // 重放不能把未读完的请求体留在连接上
    options.onReplay?.();
    return {
      status: reservation.status_code,
      data: JSON.parse(reservation.response_json) as unknown,
    };
  }

  try {
    const result = await run();
    ctx.repos.idempotency.complete(scope, key, result.status, JSON.stringify(result.data));
    return result;
  } catch (error) {
    ctx.repos.idempotency.release(scope, key);
    throw error;
  }
}