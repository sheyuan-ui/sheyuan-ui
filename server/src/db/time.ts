/** 契约时间是 UTC ISO 8601；入库统一规范成带毫秒的 Z 形式，保证字符串排序即时间排序。 */
export function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效时间：${String(value)}`);
  }
  return date.toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoAfter(base: string | Date, milliseconds: number): string {
  const date = base instanceof Date ? base : new Date(base);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效时间：${String(base)}`);
  }
  return new Date(date.getTime() + milliseconds).toISOString();
}