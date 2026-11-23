import { createHash, randomBytes } from "node:crypto";
import { isoAfter, nowIso } from "../db/time.ts";
import { withTransaction } from "../db/transaction.ts";
import type { Repositories } from "../repos/index.ts";
import type { UserRecord } from "../repos/users.ts";
import { HttpError } from "../server/http-errors.ts";
import { signAccessToken, verifyAccessToken } from "./jwt.ts";
import { verifyPassword } from "./password.ts";
import type { AuthUser, Role } from "./roles.ts";

export interface AuthServiceOptions {
  /** HS256 签名密钥；至少 32 字节随机值 */
  secret: string;
  issuer?: string;
  /** 访问令牌有效期，默认 15 分钟 */
  accessTtlSeconds?: number;
  /** 刷新令牌有效期，默认 30 天 */
  refreshTtlSeconds?: number;
}

/** 认证事件的审计上下文；不参与鉴权，只用于留痕 */
export interface AuthRequestMeta {
  request_id: string;
  client?: string | null;
}

export interface PublicUser {
  user_id: string;
  username: string;
  display_name: string;
  role: Role;
}

export interface TokenPair {
  access_token: string;
  token_type: "Bearer";
  /** 访问令牌剩余秒数，前端据此提前刷新 */
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: PublicUser;
}

const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    user_id: user.user_id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
  };
}

/**
 * 认证服务：登录、刷新令牌轮换、登出、请求身份解析。
 * 登录失败、注销、复用检测等认证事件在这里直接写审计，保证任何入口都不会漏记。
 */
export class AuthService {
  readonly repos: Repositories;
  readonly secret: string;
  readonly issuer: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;

  constructor(repos: Repositories, options: AuthServiceOptions) {
    this.repos = repos;
    this.secret = options.secret;
    this.issuer = options.issuer ?? "helmet-hub";
    this.accessTtlSeconds = options.accessTtlSeconds ?? DEFAULT_ACCESS_TTL_SECONDS;
    this.refreshTtlSeconds = options.refreshTtlSeconds ?? DEFAULT_REFRESH_TTL_SECONDS;
  }

  login(username: string, password: string, meta: AuthRequestMeta): TokenPair {
    const user = this.repos.users.findByUsername(username);
    if (user === null || !verifyPassword(password, user.password_hash)) {
      // 账号不存在与口令错误返回同一提示，避免账号枚举
      this.repos.audit.append({
        action: "auth.login_failed",
        target_type: "user",
        target_id: username,
        detail: { request_id: meta.request_id, client: meta.client ?? null },
      });
      throw new HttpError("UNAUTHORIZED", "账号或口令不正确");
    }

    if (user.status !== "active") {
      this.repos.audit.append({
        actor_id: user.user_id,
        actor_role: user.role,
        action: "auth.login_rejected",
        target_type: "user",
        target_id: user.user_id,
        detail: { request_id: meta.request_id, reason: "disabled" },
      });
      throw new HttpError("FORBIDDEN", "账号已停用");
    }

    const pair = this.issue(user, meta);
    this.repos.users.touchLogin(user.user_id);
    this.repos.audit.append({
      actor_id: user.user_id,
      actor_role: user.role,
      action: "auth.login",
      target_type: "user",
      target_id: user.user_id,
      detail: { request_id: meta.request_id, client: meta.client ?? null },
    });
    return pair;
  }

  /** 刷新即轮换：旧令牌立即失效，被撤销的令牌再次出现视为泄漏，整账号令牌全部吊销 */
  rotate(rawRefreshToken: string, meta: AuthRequestMeta): TokenPair {
    const record = this.repos.refreshTokens.findByHash(hashRefreshToken(rawRefreshToken));
    if (record === null) {
      throw new HttpError("UNAUTHORIZED", "刷新令牌无效");
    }

    if (record.revoked_at !== null) {
      this.repos.refreshTokens.revokeAllForUser(record.user_id, "reuse_detected");
      this.repos.audit.append({
        actor_id: record.user_id,
        action: "auth.refresh_reuse",
        target_type: "user",
        target_id: record.user_id,
        detail: {
          request_id: meta.request_id,
          token_id: record.token_id,
          revoked_reason: record.revoked_reason,
        },
      });
      throw new HttpError("UNAUTHORIZED", "刷新令牌已被吊销，请重新登录");
    }

    if (record.expires_at <= nowIso()) {
      throw new HttpError("UNAUTHORIZED", "登录已过期，请重新登录");
    }

    const user = this.repos.users.get(record.user_id);
    if (user === null || user.status !== "active") {
      this.repos.refreshTokens.revokeAllForUser(record.user_id, "disabled");
      throw new HttpError("FORBIDDEN", "账号已停用");
    }

    const pair = withTransaction(this.repos.users.db, () => {
      const issued = this.issue(user, meta);
      const next = this.repos.refreshTokens.findByHash(hashRefreshToken(issued.refresh_token));
      this.repos.refreshTokens.revoke(record.token_id, "rotated", next?.token_id ?? null);
      this.repos.audit.append({
        actor_id: user.user_id,
        actor_role: user.role,
        action: "auth.refresh",
        target_type: "user",
        target_id: user.user_id,
        detail: { request_id: meta.request_id, token_id: record.token_id },
      });
      return issued;
    });

    return pair;
  }

  /** 登出幂等：令牌不存在或已吊销都不报错，避免前端重试时弹错 */
  logout(rawRefreshToken: string, meta: AuthRequestMeta): boolean {
    const record = this.repos.refreshTokens.findByHash(hashRefreshToken(rawRefreshToken));
    if (record === null || record.revoked_at !== null) return false;

    this.repos.refreshTokens.revoke(record.token_id, "logout");
    this.repos.audit.append({
      actor_id: record.user_id,
      action: "auth.logout",
      target_type: "user",
      target_id: record.user_id,
      detail: { request_id: meta.request_id, token_id: record.token_id },
    });
    return true;
  }

  /** 解析 Authorization: Bearer <JWT>；令牌有效但账号被停用时按未认证处理 */
  authenticate(authorization: string | undefined): AuthUser | null {
    if (authorization === undefined) return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (match === null) return null;

    const result = verifyAccessToken(match[1] as string, {
      secret: this.secret,
      issuer: this.issuer,
    });
    if (!result.ok) return null;

    const user = this.repos.users.get(result.claims.sub);
    if (user === null || user.status !== "active") return null;

    return {
      user_id: user.user_id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    };
  }

  /** 签发访问令牌 + 刷新令牌；刷新令牌只把哈希落库 */
  private issue(user: UserRecord, meta: AuthRequestMeta): TokenPair {
    const access = signAccessToken(user, {
      secret: this.secret,
      issuer: this.issuer,
      ttlSeconds: this.accessTtlSeconds,
    });

    const rawRefresh = randomBytes(32).toString("base64url");
    this.repos.refreshTokens.create({
      user_id: user.user_id,
      token_hash: hashRefreshToken(rawRefresh),
      expires_at: isoAfter(nowIso(), this.refreshTtlSeconds * 1_000),
      client: meta.client ?? null,
    });

    return {
      access_token: access.token,
      token_type: "Bearer",
      expires_in: this.accessTtlSeconds,
      refresh_token: rawRefresh,
      refresh_expires_in: this.refreshTtlSeconds,
      user: toPublicUser(user),
    };
  }
}
