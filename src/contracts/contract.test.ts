/**
 * T02 契约测试：mock 样例必须通过 JSON Schema，关键非法数据必须被拦住。
 * 前端类型与后端返回是否一致，靠这份测试兜底。
 */

import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { SCHEMAS, type SchemaName } from "./schema";
import { MOCK_CONTRACT } from "./mock";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validators = Object.fromEntries(
  Object.entries(SCHEMAS).map(([name, schema]) => [name, ajv.compile(schema)]),
) as Record<SchemaName, ValidateFunction>;

function check(name: SchemaName, data: unknown) {
  const validate = validators[name];
  const valid = validate(data);
  return { valid, errors: validate.errors ?? [] };
}

describe("六对象 mock 样例", () => {
  for (const name of Object.keys(SCHEMAS) as SchemaName[]) {
    it(`${name} 通过 schema 校验`, () => {
      const result = check(name, MOCK_CONTRACT[name]);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }
});

describe("空值语义：未知为 null 仍合法", () => {
  it("battery_pct / rssi_dbm 为 null 通过", () => {
    const data = structuredClone(MOCK_CONTRACT.deviceStatus);
    data.battery_pct = null;
    data.wifi.rssi_dbm = null;
    expect(check("deviceStatus", data).valid).toBe(true);
  });

  it("session ended_at 与 score.value 为 null 通过", () => {
    const data = structuredClone(MOCK_CONTRACT.session);
    data.ended_at = null;
    data.score = { ...data.score, value: null, status: "unavailable" };
    expect(check("session", data).valid).toBe(true);
  });

  it("job location.geo 为 null 通过", () => {
    const data = structuredClone(MOCK_CONTRACT.job);
    data.location = { ...data.location, geo: null };
    expect(check("job", data).valid).toBe(true);
  });
});

describe("非法数据必须被拦住", () => {
  it("battery_pct 超出 0–100", () => {
    const data = { ...MOCK_CONTRACT.deviceStatus, battery_pct: 120 };
    expect(check("deviceStatus", data).valid).toBe(false);
  });

  it("缺少必填字段 battery_pct", () => {
    const data = structuredClone(MOCK_CONTRACT.deviceStatus) as unknown as Record<string, unknown>;
    delete data.battery_pct;
    expect(check("deviceStatus", data).valid).toBe(false);
  });

  it("task_state 不在枚举内", () => {
    const data = { ...MOCK_CONTRACT.deviceStatus, task_state: "run" };
    expect(check("deviceStatus", data).valid).toBe(false);
  });

  it("单方面新增字段（additionalProperties）", () => {
    const data = { ...MOCK_CONTRACT.deviceStatus, device_name: "一号头盔" };
    expect(check("deviceStatus", data).valid).toBe(false);
  });

  it("confidence 超出 0–1", () => {
    const data = { ...MOCK_CONTRACT.event, confidence: 1.5 };
    expect(check("event", data).valid).toBe(false);
  });

  it("指令结果 state 不是五种之一", () => {
    const data = structuredClone(MOCK_CONTRACT.command);
    data.result = { ...data.result, state: "success" } as unknown as typeof data.result;
    expect(check("command", data).valid).toBe(false);
  });

  it("上传 status 不在枚举内", () => {
    const data = { ...MOCK_CONTRACT.upload, status: "done" };
    expect(check("upload", data).valid).toBe(false);
  });

  it("sha256 不是 64 位小写十六进制", () => {
    const data = { ...MOCK_CONTRACT.upload, sha256: "abc123" };
    expect(check("upload", data).valid).toBe(false);
  });

  it("时间不是 ISO 8601", () => {
    const data = { ...MOCK_CONTRACT.job, created_at: "2026/11/18 09:58:20" };
    expect(check("job", data).valid).toBe(false);
  });
});
