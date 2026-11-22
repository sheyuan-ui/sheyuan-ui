import { toIso } from "../db/time.ts";
import { HttpError } from "./http-errors.ts";

export function queryStr(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  return value === null || value.length === 0 ? undefined : value;
}

export function queryInt(
  url: URL,
  name: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  const raw = queryStr(url, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new HttpError("INVALID_ARGUMENT", `${name} 必须为整数`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new HttpError("INVALID_ARGUMENT", `${name} 不能小于 ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new HttpError("INVALID_ARGUMENT", `${name} 不能大于 ${options.max}`);
  }
  return value;
}

export function queryIso(url: URL, name: string): string | undefined {
  const raw = queryStr(url, name);
  if (raw === undefined) return undefined;
  try {
    return toIso(raw);
  } catch {
    throw new HttpError("INVALID_ARGUMENT", `${name} 必须为 ISO 8601 时间`, { [name]: "date-time" });
  }
}

export function queryEnum<T extends string>(
  url: URL,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const raw = queryStr(url, name);
  if (raw === undefined) return undefined;
  if (!allowed.includes(raw as T)) {
    throw new HttpError("INVALID_ARGUMENT", `${name} 取值不合法`, { [name]: allowed.join(" | ") });
  }
  return raw as T;
}