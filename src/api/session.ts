/** 登录态存储：访问令牌、刷新令牌、当前用户。只落 localStorage，不放其他位置。 */

export type Role = "viewer" | "operator" | "admin";

const ROLES: readonly Role[] = ["viewer", "operator", "admin"];

export interface AuthUser {
  user_id: string;
  username: string;
  display_name: string;
  role: Role;
}

/** 与服务端 AuthService 返回的令牌对一致 */
export interface TokenPair {
  access_token: string;
  token_type: "Bearer";
  /** 访问令牌剩余秒数 */
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  user: AuthUser;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const KEY = {
  access: "sheyuan.auth.access",
  refresh: "sheyuan.auth.refresh",
  user: "sheyuan.auth.user",
} as const;

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.user_id === "string" &&
    typeof user.username === "string" &&
    typeof user.display_name === "string" &&
    typeof user.role === "string" &&
    (ROLES as readonly string[]).includes(user.role)
  );
}

export function saveTokenPair(pair: TokenPair): void {
  localStorage.setItem(KEY.access, pair.access_token);
  localStorage.setItem(KEY.refresh, pair.refresh_token);
  localStorage.setItem(KEY.user, JSON.stringify(pair.user));
}

export function loadSession(): StoredSession | null {
  const accessToken = localStorage.getItem(KEY.access);
  const refreshToken = localStorage.getItem(KEY.refresh);

  let user: unknown = null;
  try {
    user = JSON.parse(localStorage.getItem(KEY.user) ?? "null");
  } catch {
    user = null;
  }

  if (accessToken === null || refreshToken === null || !isAuthUser(user)) {
    // 半截或损坏的登录态不能留，否则 401 循环
    if (accessToken !== null || refreshToken !== null || user !== null) clearSession();
    return null;
  }

  return { accessToken, refreshToken, user };
}

export function getAccessToken(): string | null {
  return localStorage.getItem(KEY.access);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(KEY.refresh);
}

export function clearSession(): void {
  localStorage.removeItem(KEY.access);
  localStorage.removeItem(KEY.refresh);
  localStorage.removeItem(KEY.user);
}