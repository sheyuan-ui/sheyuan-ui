import { API } from "../../contracts/api.ts";
import type { SessionStatus } from "../../contracts/types.ts";
import type { SessionFilter } from "../../repos/index.ts";
import { HttpError } from "../http-errors.ts";
import { queryEnum, queryInt, queryIso, queryStr } from "../query.ts";
import type { Router } from "../router.ts";

const SESSION_STATUSES: readonly SessionStatus[] = ["active", "ended", "aborted"];

export function registerSessionRoutes(router: Router): void {
  router.add("GET", API.sessions, (ctx) => {
    const filter: SessionFilter = {
      job_id: queryStr(ctx.url, "job_id"),
      device_id: queryStr(ctx.url, "device_id"),
      status: queryEnum(ctx.url, "status", SESSION_STATUSES),
      started_from: queryIso(ctx.url, "started_from"),
      started_to: queryIso(ctx.url, "started_to"),
      page: queryInt(ctx.url, "page", { min: 1 }),
      page_size: queryInt(ctx.url, "page_size", { min: 1, max: 200 }),
    };
    return { status: 200, data: ctx.repos.sessions.list(filter) };
  });

  router.add("GET", API.session(":id"), (ctx) => {
    const sessionId = ctx.params.id as string;
    const session = ctx.repos.sessions.get(sessionId);
    if (!session) throw new HttpError("NOT_FOUND", `会话不存在：${sessionId}`);
    return { status: 200, data: session };
  });

  router.add("GET", API.sessionEvents(":id"), (ctx) => {
    const sessionId = ctx.params.id as string;
    if (!ctx.repos.sessions.get(sessionId)) {
      throw new HttpError("NOT_FOUND", `会话不存在：${sessionId}`);
    }
    return { status: 200, data: ctx.repos.events.listBySession(sessionId) };
  });
}