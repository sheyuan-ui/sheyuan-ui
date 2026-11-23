import { readJsonBody } from "../body.ts";
import { readHeader } from "../headers.ts";
import { HttpError } from "../http-errors.ts";
import { queryInt } from "../query.ts";
import type { RequestContext, Router } from "../router.ts";
import { asObject, str } from "../validate.ts";

/**
 * 认证接口路径。
 * 单独放在这里而不是加进 server/src/contracts/api.ts：那份是上游只读副本，
 * 按 DATABASE.md §9 的接手约定，认证相关契约另起，不修改副本。
 */
export const AUTH_API = {
  login: "/api/auth/login",
  refresh: "/api/auth/refresh",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  /** 审计流水，仅 admin */
  audit: "/api/audit",
} as const;

function metaOf(ctx: RequestContext) {
  return {
    request_id: ctx.requestId,
    client: readHeader(ctx.req.headers, "user-agent") ?? null,
  };
}

export function registerAuthRoutes(router: Router): void {
  router.add("POST", AUTH_API.login, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    const input = asObject(body.value);
    const tokens = ctx.authService.login(
      str(input, "username"),
      str(input, "password"),
      metaOf(ctx),
    );
    return { status: 200, data: tokens };
  });

  router.add("POST", AUTH_API.refresh, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    const input = asObject(body.value);
    return {
      status: 200,
      data: ctx.authService.rotate(str(input, "refresh_token"), metaOf(ctx)),
    };
  });

  router.add("POST", AUTH_API.logout, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    const input = asObject(body.value);
    const revoked = ctx.authService.logout(str(input, "refresh_token"), metaOf(ctx));
    return { status: 200, data: { revoked } };
  });

  router.add("GET", AUTH_API.me, (ctx) => {
    if (ctx.auth === null) throw new HttpError("UNAUTHORIZED");
    return {
      status: 200,
      data: {
        user_id: ctx.auth.user_id,
        username: ctx.auth.username,
        display_name: ctx.auth.display_name,
        role: ctx.auth.role,
      },
    };
  });

  router.add("GET", AUTH_API.audit, (ctx) => {
    const limit = queryInt(ctx.url, "limit", { min: 1, max: 500 }) ?? 100;
    return { status: 200, data: ctx.repos.audit.list(limit) };
  });
}
