import { toIso } from "../db/time.ts";
import { HttpError } from "./http-errors.ts";

export function asObject(value: unknown, field = "body"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 必须为对象`);
  }
  return value as Record<string, unknown>;
}

export function str(
  source: Record<string, unknown>,
  field: string,
  options: { allowEmpty?: boolean } = {},
): string {
  const value = source[field];
  if (value === undefined) throw missing(field);
  if (typeof value !== "string") throw new HttpError("INVALID_ARGUMENT", `${field} 必须为字符串`);
  if (!options.allowEmpty && value.length === 0) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 不能为空`);
  }
  return value;
}

export function nullableStr(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError("INVALID_ARGUMENT", `${field} 必须为字符串或 null`);
  return value;
}

export function num(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 必须为数字`);
  }
  return value;
}

export function nullableNum(
  source: Record<string, unknown>,
  field: string,
  options: { min?: number; max?: number } = {},
): number | null {
  const value = source[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 必须为数字或 null`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 不能小于 ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 不能大于 ${options.max}`);
  }
  return value;
}

export function int(
  source: Record<string, unknown>,
  field: string,
  options: { min?: number; max?: number } = {},
): number {
  const value = num(source, field);
  if (!Number.isInteger(value)) throw new HttpError("INVALID_ARGUMENT", `${field} 必须为整数`);
  if (options.min !== undefined && value < options.min) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 不能小于 ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 不能大于 ${options.max}`);
  }
  return value;
}

export function bool(source: Record<string, unknown>, field: string): boolean {
  const value = source[field];
  if (typeof value !== "boolean") throw new HttpError("INVALID_ARGUMENT", `${field} 必须为布尔值`);
  return value;
}

export function enumOf<T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = source[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 取值不合法`, {
      [field]: allowed.join(" | "),
    });
  }
  return value as T;
}

export function isoStr(source: Record<string, unknown>, field: string): string {
  return parseIso(str(source, field), field);
}

export function nullableIso(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError("INVALID_ARGUMENT", `${field} 必须为字符串或 null`);
  return parseIso(value, field);
}

export function objArray(source: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const value = source[field];
  if (value === undefined) throw missing(field);
  if (!Array.isArray(value)) throw new HttpError("INVALID_ARGUMENT", `${field} 必须为对象数组`);
  return value.map((item, index) => asObject(item, `${field}[${index}]`));
}

export function strArray(source: Record<string, unknown>, field: string): string[] {
  const value = source[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new HttpError("INVALID_ARGUMENT", `${field} 必须为字符串数组`);
  }
  return value as string[];
}

function missing(field: string): HttpError {
  return new HttpError("INVALID_ARGUMENT", `缺少字段 ${field}`, { [field]: "required" });
}

function parseIso(value: string, field: string): string {
  try {
    return toIso(value);
  } catch {
    throw new HttpError("INVALID_ARGUMENT", `${field} 必须为 ISO 8601 时间`, {
      [field]: "date-time",
    });
  }
}