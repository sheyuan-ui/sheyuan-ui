import { ERROR_CODES, type ErrorCode } from "../contracts/errors.ts";
import {
  ConflictError,
  NotFoundError,
  StaleVersionError,
  ValidationError,
} from "../db/errors.ts";
import { isCheckViolation, isForeignKeyViolation } from "../db/sqlite-errors.ts";

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, string> | undefined;

  constructor(code: ErrorCode, message?: string, details?: Record<string, string>) {
    super(message ?? ERROR_CODES[code].message);
    this.name = "HttpError";
    this.code = code;
    this.status = ERROR_CODES[code].http;
    this.details = details;
  }
}

export interface ErrorPayload {
  status: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, string>;
}

export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  if (error instanceof NotFoundError) {
    return { status: ERROR_CODES.NOT_FOUND.http, code: "NOT_FOUND", message: error.message };
  }
  if (error instanceof StaleVersionError || error instanceof ConflictError) {
    return { status: ERROR_CODES.CONFLICT.http, code: "CONFLICT", message: error.message };
  }
  if (error instanceof ValidationError) {
    return {
      status: ERROR_CODES.INVALID_ARGUMENT.http,
      code: "INVALID_ARGUMENT",
      message: error.message,
    };
  }
  if (isCheckViolation(error) || isForeignKeyViolation(error)) {
    return {
      status: ERROR_CODES.INVALID_ARGUMENT.http,
      code: "INVALID_ARGUMENT",
      message: "数据不满足约束",
    };
  }
  return {
    status: ERROR_CODES.INTERNAL.http,
    code: "INTERNAL",
    message: ERROR_CODES.INTERNAL.message,
  };
}