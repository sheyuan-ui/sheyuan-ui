import type { IncomingMessage } from "node:http";
import { HttpError } from "./http-errors.ts";

const JSON_LIMIT_BYTES = 1024 * 1024;

export interface JsonBody {
  /** 原始文本，用于幂等键的请求指纹 */
  raw: string;
  value: unknown;
}

export async function readJsonBody(req: IncomingMessage, allowEmpty = false): Promise<JsonBody> {
  const contentType = (req.headers["content-type"] ?? "").toLowerCase();
  const isJson = contentType.includes("application/json");
  if (!isJson && !allowEmpty) {
    throw new HttpError("UNSUPPORTED_MEDIA_TYPE", "请求体必须为 application/json");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > JSON_LIMIT_BYTES) {
      throw new HttpError("PAYLOAD_TOO_LARGE", "JSON 请求体超过 1 MB");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) {
    if (allowEmpty) return { raw, value: null };
    throw new HttpError("INVALID_ARGUMENT", "请求体不能为空");
  }
  if (!isJson) {
    throw new HttpError("UNSUPPORTED_MEDIA_TYPE", "请求体必须为 application/json");
  }

  try {
    return { raw, value: JSON.parse(raw) as unknown };
  } catch {
    throw new HttpError("INVALID_ARGUMENT", "请求体不是合法 JSON");
  }
}