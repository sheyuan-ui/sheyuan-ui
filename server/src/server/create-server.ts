import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { AuthUser } from "../auth/roles.ts";
import { AuthService } from "../auth/service.ts";
import type { Db } from "../db/index.ts";
import { nowIso } from "../db/time.ts";
import { createRepositories } from "../repos/index.ts";
import { DEMO_HTML } from "./demo.ts";
import { registerAllRoutes } from "./handlers/index.ts";
import { readHeader } from "./headers.ts";
import { Hub } from "./hub.ts";
import { HttpError, toErrorPayload } from "./http-errors.ts";
import { recordAccessDenied } from "./middleware/audit.ts";
import { enforcePolicy, requiredPolicy } from "./middleware/roles.ts";
import { Router, type RequestContext, type RouteResult } from "./router.ts";

export interface HelmetServerOptions {
  db: Db;
  /** 分块落盘目录；不存在时在首个分块写入时创建 */
  uploadDir: string;
  /** 设置后 /api 与 /ws 都需要携带令牌 */
  token?: string;
  /** 默认 *，前端跨域直接调用 */
  corsOrigin?: string;
  logger?: (message: string) => void;
  /** 开启后 /api 按三角色强制鉴权；默认关闭，保留本地演示与既有集成测试的免登录路径 */
  requireAuth?: boolean;
  /** JWT 签名密钥；未提供时读 HELMET_HUB_JWT_SECRET，仍为空则每次启动随机生成 */
  jwtSecret?: string;
  /** 访问令牌有效期，默认 900 秒 */
  accessTokenTtlSeconds?: number;
  /** 刷新令牌有效期，默认 30 天 */
  refreshTokenTtlSeconds?: number;
}

export interface HelmetServer {
  server: Server;
  hub: Hub;
  listen(port?: number, host?: string): Promise<AddressInfo>;
  close(): Promise<void>;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = readHeader(req.headers, "authorization");
  if (header === undefined) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? tokenMatches(match[1], token) : false;
}

/** 共享令牌代表部署方本身，按 admin 记录审计，不代表任何自然人账号 */
const SYSTEM_ACTOR: AuthUser = {
  user_id: "system",
  username: "system",
  display_name: "共享令牌",
  role: "admin",
};

function resolveSecret(options: HelmetServerOptions): string {
  const configured = options.jwtSecret ?? process.env.HELMET_HUB_JWT_SECRET;
  if (configured !== undefined && configured.length > 0) {
    if (configured.length < 32) throw new Error("JWT 密钥至少 32 个字符");
    return configured;
  }
  if (options.requireAuth === true) {
    options.logger?.("未配置 HELMET_HUB_JWT_SECRET，本次使用随机密钥；重启后已签发的令牌全部失效");
  }
  return randomBytes(32).toString("hex");
}

export function createHelmetServer(options: HelmetServerOptions): HelmetServer {
  const repos = createRepositories(options.db);
  const authService = new AuthService(repos, {
    secret: resolveSecret(options),
    accessTtlSeconds: options.accessTokenTtlSeconds,
    refreshTtlSeconds: options.refreshTokenTtlSeconds,
  });
  const router = new Router();
  registerAllRoutes(router);
  const corsOrigin = options.corsOrigin ?? "*";

  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  const hub = new Hub(server, { token: options.token });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = readHeader(req.headers, "x-request-id") ?? randomUUID();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    res.setHeader("access-control-allow-origin", corsOrigin);
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader(
      "access-control-allow-headers",
      "Content-Type, Authorization, Idempotency-Key, X-Request-Id, X-Actor-Id",
    );
    res.setHeader("access-control-expose-headers", "X-Request-Id");
    res.setHeader("access-control-max-age", "600");
    res.setHeader("vary", "Origin");
    res.setHeader("x-request-id", requestId);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let actor: AuthUser | null = null;

    try {
      if (url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(DEMO_HTML);
        return;
      }

      if (url.pathname === "/healthz") {
        sendJson(res, 200, { data: { status: "ok", now: nowIso() }, request_id: requestId });
        return;
      }

      // 先解析身份，再按角色矩阵放行：JWT 优先，共享令牌等价于部署方 admin
      actor = authService.authenticate(readHeader(req.headers, "authorization"));
      if (actor === null && options.token !== undefined && authorized(req, options.token)) {
        actor = SYSTEM_ACTOR;
      }

      // 旧共享令牌开启时仍要求携带令牌；三角色矩阵只在 requireAuth 下生效
      if (options.token !== undefined && actor === null) {
        req.resume();
        throw new HttpError("UNAUTHORIZED");
      }

      const match = router.match(req.method ?? "GET", url.pathname);
      if (!match) {
        req.resume();
        throw new HttpError("NOT_FOUND", `接口不存在：${req.method ?? "GET"} ${url.pathname}`);
      }

      if (options.requireAuth === true) {
        enforcePolicy(requiredPolicy(req.method ?? "GET", url.pathname), actor);
      }

      const ctx: RequestContext = {
        req,
        res,
        url,
        params: match.params,
        requestId,
        repos,
        hub,
        uploadDir: options.uploadDir,
        auth: actor,
        authService,
      };
      const result: RouteResult = await match.handler(ctx);
      sendJson(res, result.status, { data: result.data, request_id: requestId }, result.headers);
    } catch (error) {
      const payload = toErrorPayload(error);
      if (
        options.requireAuth === true &&
        (payload.code === "UNAUTHORIZED" || payload.code === "FORBIDDEN")
      ) {
        recordAccessDenied(
          repos,
          {
            request_id: requestId,
            method: req.method ?? "GET",
            path: url.pathname,
            actor,
            code: payload.code,
          },
          options.logger,
        );
      }
      if (payload.status >= 500) {
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
        options.logger?.(`[${requestId}] ${detail}`);
      }
      const body: Record<string, unknown> = {
        code: payload.code,
        message: payload.message,
        request_id: requestId,
      };
      if (payload.details !== undefined) body.details = payload.details;
      sendJson(res, payload.status, body);
    }
  }

  return {
    server,
    hub,
    listen(port = 8080, host = "0.0.0.0") {
      return new Promise<AddressInfo>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve(server.address() as AddressInfo);
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
    },
    async close() {
      hub.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
    },
  };
}