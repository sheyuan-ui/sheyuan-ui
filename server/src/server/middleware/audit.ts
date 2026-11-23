import type { AuthUser } from "../../auth/roles.ts";
import type { Repositories } from "../../repos/index.ts";

export interface DeniedInput {
  request_id: string;
  method: string;
  path: string;
  actor: AuthUser | null;
  code: "UNAUTHORIZED" | "FORBIDDEN";
}

/**
 * 审计中间件：鉴权失败与越权尝试统一留痕。
 * 登录、刷新、登出等认证事件由 AuthService 自己写，这里只补"请求被挡下"的事实。
 */
export function recordAccessDenied(
  repos: Repositories,
  input: DeniedInput,
  logger?: (message: string) => void,
): void {
  try {
    repos.audit.append({
      actor_id: input.actor?.user_id ?? null,
      actor_role: input.actor?.role ?? null,
      action: input.code === "FORBIDDEN" ? "auth.forbidden" : "auth.unauthenticated",
      target_type: "http",
      target_id: `${input.method.toUpperCase()} ${input.path}`,
      detail: { request_id: input.request_id },
    });
  } catch (error) {
    // 审计失败不能覆盖原始的 401/403；只记日志
    logger?.(`审计写入失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
