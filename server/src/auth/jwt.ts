import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Role } from "./roles.ts";

/**
 * 短期访问令牌：HS256，默认 15 分钟。
 * 不落库，靠过期时间收敛风险；吊销只针对刷新令牌。
 */

export interface AccessClaims {
  sub: string;
  role: Role;
  name: string;
  iss: string;
  iat: number;
  exp: number;
  jti: string;
  typ: "access";
}

export type VerifyResult =
  | { ok: true; claims: AccessClaims }
  | { ok: false; reason: "malformed" | "signature" | "expired" | "issuer" };

function b64url(value: Buffer | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer.toString("base64url");
}

function sign(signingInput: string, secret: string): string {
  return createHmac("sha256", secret).update(signingInput).digest("base64url");
}

export interface SignOptions {
  secret: string;
  issuer: string;
  ttlSeconds: number;
  now?: number;
}

export function signAccessToken(
  user: { user_id: string; role: Role; display_name: string },
  options: SignOptions,
): { token: string; expiresAt: number } {
  const issuedAt = options.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + options.ttlSeconds;

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: AccessClaims = {
    sub: user.user_id,
    role: user.role,
    name: user.display_name,
    iss: options.issuer,
    iat: issuedAt,
    exp: expiresAt,
    jti: randomUUID(),
    typ: "access",
  };
  const signingInput = `${header}.${b64url(JSON.stringify(payload))}`;
  return { token: `${signingInput}.${sign(signingInput, options.secret)}`, expiresAt };
}

export interface VerifyOptions {
  secret: string;
  issuer: string;
  now?: number;
}

export function verifyAccessToken(token: string, options: VerifyOptions): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [header, payload, signature] = parts as [string, string, string];

  const signingInput = `${header}.${payload}`;
  const expected = Buffer.from(sign(signingInput, options.secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "signature" };
  }

  let claims: AccessClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AccessClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (claims.typ !== "access") return { ok: false, reason: "malformed" };
  if (claims.iss !== options.issuer) return { ok: false, reason: "issuer" };

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) return { ok: false, reason: "expired" };

  return { ok: true, claims };
}
