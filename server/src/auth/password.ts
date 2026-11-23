import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt 参数；与哈希一起存库，便于将来调参后逐个账号升级 */
const SCRYPT = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
const PREFIX = "scrypt";

/** 口令最短长度；只做长度校验，不做复杂度规则的"假安全" */
export const PASSWORD_MIN_LENGTH = 8;

export function assertPasswordPolicy(plain: string): void {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`口令至少 ${PASSWORD_MIN_LENGTH} 位`);
  }
}

/** 输出 scrypt$N$r$p$salt$hash，全部十六进制，便于入库与对照 */
export function hashPassword(plain: string): string {
  assertPasswordPolicy(plain);
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(plain, salt, KEY_BYTES, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
  return [PREFIX, SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("hex"), key.toString("hex")].join("$");
}

/** 恒定时间比较；哈希格式不合法一律视为不匹配，不抛异常 */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [prefix, n, r, p, saltHex, hashHex] = parts as [string, string, string, string, string, string];
  if (prefix !== PREFIX) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;

  const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
