import { satisfies, type AuthUser, type Role } from "../../auth/roles.ts";
import { HttpError } from "../http-errors.ts";

export type Policy = Role | "public";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 三角色矩阵（集中一处，避免每个路由各写一份）：
 * - 登录 / 刷新：公开；
 * - 审计查询：admin；
 * - 其余读写：GET 需 viewer，写操作需 operator；admin 自动满足。
 */
export function requiredPolicy(method: string, pathname: string): Policy {
  if (pathname === "/api/auth/login" || pathname === "/api/auth/refresh") return "public";
  if (!pathname.startsWith("/api/")) return "public";
  if (pathname === "/api/audit") return "admin";
  return WRITE_METHODS.has(method.toUpperCase()) ? "operator" : "viewer";
}

/** 未认证 401，角色不足 403；错误由统一响应层渲染 */
export function enforcePolicy(policy: Policy, actor: AuthUser | null): void {
  if (policy === "public") return;
  if (actor === null) throw new HttpError("UNAUTHORIZED");
  if (!satisfies(actor.role, policy)) {
    throw new HttpError("FORBIDDEN", `需要 ${policy} 及以上角色`, {
      required_role: policy,
      current_role: actor.role,
    });
  }
}
