import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { Db } from "../db/index.ts";
import { nowIso } from "../db/time.ts";
import { createRepositories } from "../repos/index.ts";
import { DEMO_HTML } from "./demo.ts";
import { registerAllRoutes } from "./handlers/index.ts";
import { readHeader } from "./headers.ts";
import { Hub } from "./hub.ts";
import { HttpError, toErrorPayload } from "./http-errors.ts";
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

export function createHelmetServer(options: HelmetServerOptions): HelmetServer {
  const repos = createRepositories(options.db);
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

      if (options.token !== undefined && !authorized(req, options.token)) {
        req.resume();
        throw new HttpError("UNAUTHORIZED");
      }

      const match = router.match(req.method ?? "GET", url.pathname);
      if (!match) {
        req.resume();
        throw new HttpError("NOT_FOUND", `接口不存在：${req.method ?? "GET"} ${url.pathname}`);
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
      };
      const result: RouteResult = await match.handler(ctx);
      sendJson(res, result.status, { data: result.data, request_id: requestId }, result.headers);
    } catch (error) {
      const payload = toErrorPayload(error);
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