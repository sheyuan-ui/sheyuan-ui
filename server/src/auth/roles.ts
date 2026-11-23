/** 三角色：viewer 只读，operator 可写，admin 管账号与审计。枚举与 audit_log.actor_role 一致。 */
export type Role = "viewer" | "operator" | "admin";

export const ROLE_LEVEL: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

export const ROLES: readonly Role[] = ["viewer", "operator", "admin"];

/** 验签通过后的请求身份；不含口令与令牌 */
export interface AuthUser {
  user_id: string;
  username: string;
  display_name: string;
  role: Role;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** 高等级角色自动满足低等级要求：admin 可以只读，viewer 不能写 */
export function satisfies(actual: Role, required: Role): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}
