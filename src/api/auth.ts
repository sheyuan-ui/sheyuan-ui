import {
  getRefreshToken,
  loadSession,
  saveTokenPair,
  clearSession,
  type AuthUser,
  type Role,
  type TokenPair,
} from "./session";
import { AUTH_PATHS, USE_MOCK, onUnauthorized, refreshSession, request } from "./client";

const MOCK_LOGIN_DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** mock 按账号名前缀模拟角色，便于在无后端时验收权限差异 */
function mockRole(username: string): Role {
  const name = username.toLowerCase();
  if (name.startsWith("viewer")) return "viewer";
  if (name.startsWith("operator")) return "operator";
  return "admin";
}

function mockTokenPair(username: string): TokenPair {
  const user: AuthUser = {
    user_id: `mock-${username}`,
    username,
    display_name: username,
    role: mockRole(username),
  };
  return {
    access_token: `mock-access-${username}`,
    token_type: "Bearer",
    expires_in: 15 * 60,
    refresh_token: `mock-refresh-${username}`,
    refresh_expires_in: 30 * 24 * 60 * 60,
    user,
  };
}

async function login(username: string, password: string): Promise<AuthUser> {
  if (USE_MOCK) {
    await delay(MOCK_LOGIN_DELAY_MS);
    const pair = mockTokenPair(username);
    saveTokenPair(pair);
    return pair.user;
  }

  const pair = await request<TokenPair>(AUTH_PATHS.login, {
    method: "POST",
    json: { username, password },
    auth: false,
  });
  saveTokenPair(pair);
  return pair.user;
}

async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  // 先清本地：即使服务端不可达，界面也必须立刻退出
  clearSession();
  if (USE_MOCK || refreshToken === null) return;

  try {
    await request<{ revoked: boolean }>(AUTH_PATHS.logout, {
      method: "POST",
      json: { refresh_token: refreshToken },
      auth: false,
    });
  } catch {
    // 本地登录态已清理，登出请求失败不打扰用户
  }
}

function currentUser(): AuthUser | null {
  return loadSession()?.user ?? null;
}

export const authApi = {
  login,
  logout,
  refresh: refreshSession,
  currentUser,
  onUnauthorized,
};