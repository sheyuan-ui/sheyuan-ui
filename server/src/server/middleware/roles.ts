import { satisfies, type AuthUser, type Role } from "../../auth/roles.ts";
import { HttpError } from "../http-errors.ts";

export type Policy = Role | "public" | "device";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const DEVICE_ROUTES: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/devices\/register$/ },
  { method: "POST", pattern: /^\/api\/devices\/[^/]+\/heartbeat$/ },
];

/** 设备侧接口：由设备令牌鉴权，不参与人账号角色矩阵 */
export function isDeviceRoute(method: string, pathname: string): boolean {
  const upper = method.toUpperCase();
  return DEVICE_ROUTES.some((route) => route.method === upper && route.pattern.test(pathname));
}

/**
 * 三角色矩阵（集中一处，避免每个路由各写一份）：
 * - 登录 / 刷新：公开；
 * - 设备注册 / 心跳：设备令牌；
 * - 审计查询：admin；
 * - 其余读写：GET 需 viewer，写操作需 operator；admin 自动满足。
 */
export function requiredPolicy(method: string, pathname: string): Policy {
  if (pathname === "/api/auth/login" || pathname === "/api/auth/refresh") return "public";
  if (isDeviceRoute(method, pathname)) return "device";
  if (!pathname.startsWith("/api/")) return "public";
  if (pathname === "/api/audit") return "admin";
  return WRITE_METHODS.has(method.toUpperCase()) ? "operator" : "viewer";
}

/** 未认证 401，角色不足 403；错误由统一响应层渲染 */
export function enforcePolicy(policy: Policy, actor: AuthUser | null): void {
  if (policy === "public") return;
  if (policy === "device") {
    throw new HttpError("INTERNAL", "设备接口由设备令牌鉴权，不进入角色矩阵");
  }
  if (actor === null) throw new HttpError("UNAUTHORIZED");
  if (!satisfies(actor.role, policy)) {
    throw new HttpError("FORBIDDEN", `需要 ${policy} 及以上角色`, {
      required_role: policy,
      current_role: actor.role,
    });
  }
}
