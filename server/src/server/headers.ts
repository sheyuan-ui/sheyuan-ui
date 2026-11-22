import type { IncomingHttpHeaders } from "node:http";

export function headerValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first.trim().length === 0 ? undefined : first;
}

export function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  return headerValue(headers[name.toLowerCase()]);
}