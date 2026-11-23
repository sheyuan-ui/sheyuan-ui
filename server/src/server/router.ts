import type { AuthService } from "../auth/service.ts";
import type { AuthUser } from "../auth/roles.ts";
import type { Hub } from "./hub.ts";
import type { Repositories } from "../repos/index.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface RouteResult {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  requestId: string;
  repos: Repositories;
  hub: Hub;
  uploadDir: string;
  /** 验签后的请求身份；未认证为 null */
  auth: AuthUser | null;
  authService: AuthService;
}

export type RouteHandler = (ctx: RequestContext) => Promise<RouteResult> | RouteResult;

interface CompiledRoute {
  method: string;
  parts: string[];
  handler: RouteHandler;
}

export interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
}

export class Router {
  private readonly routes: CompiledRoute[] = [];

  add(method: string, pattern: string, handler: RouteHandler): void {
    this.routes.push({
      method: method.toUpperCase(),
      parts: pattern.split("/").filter((part) => part.length > 0),
      handler,
    });
  }

  match(method: string, pathname: string): RouteMatch | null {
    const requestParts = pathname.split("/").filter((part) => part.length > 0);

    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      if (route.parts.length !== requestParts.length) continue;

      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.parts.length; i += 1) {
        const patternPart = route.parts[i] as string;
        const requestPart = requestParts[i] as string;
        if (patternPart.startsWith(":")) {
          try {
            params[patternPart.slice(1)] = decodeURIComponent(requestPart);
          } catch {
            matched = false;
            break;
          }
        } else if (patternPart !== requestPart) {
          matched = false;
          break;
        }
      }

      if (matched) return { handler: route.handler, params };
    }

    return null;
  }
}