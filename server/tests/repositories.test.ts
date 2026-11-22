import assert from "node:assert/strict";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  mockCommand,
  mockDeviceStatus,
  mockEvent,
  mockJob,
  mockSession,
  mockUpload,
} from "../src/contracts/mock.ts";
import type { Command, Event, Upload } from "../src/contracts/types.ts";
import { migrate, openDatabase, StaleVersionError, ValidationError } from "../src/db/index.ts";
import { toIso } from "../src/db/time.ts";
import type { Db } from "../src/db/open.ts";
import { createRepositories, type Repositories } from "../src/repos/index.ts";
import { seedDemo } from "../src/seed/demo.ts";

const migrationsDir = join(import.meta.dirname, "../src/db/migrations");

let db: Db;
let repos: Repositories;

beforeEach(() => {
  db = openDatabase({ file: ":memory:" });
  migrate(db, migrationsDir);
  repos = createRepositories(db);
});

afterEach(() => {
  db.close();
});

function badUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    ...structuredClone(mockUpload),
    file_id: "file-test-001",
    job_id: null,
    session_id: null,
    status: "pending",
    progress: { uploaded_bytes: 0, chunk_size: 4_194_304, total_chunks: 5, uploaded_chunks: 0 },
    cloud_receipt: null,
    attempts: 0,
    last_error: null,
    ...overrides,
  };
}

describe("契约六对象往返", () => {
  test("写入后读出的字段与 T02 mock 一致（时间规范为带毫秒 Z）", () => {
    seedDemo(repos);

    assert.deepEqual(repos.devices.getStatus("edge-01"), {
      ...mockDeviceStatus,
      last_seen: toIso(mockDeviceStatus.last_seen),
    });

    assert.deepEqual(repos.jobs.get("job-20261118-001"), {
      ...mockJob,
      created_at: toIso(mockJob.created_at),
      location: {
        ...mockJob.location,
        geo: {
          ...mockJob.location.geo!,
          captured_at: toIso(mockJob.location.geo!.captured_at),
        },
      },
    });

    assert.deepEqual(repos.sessions.get("sess-20261118-0007"), {
      ...mockSession,
      started_at: toIso(mockSession.started_at),
    });

    assert.deepEqual(repos.events.get("evt-20261118-0132"), {
      ...mockEvent,
      time: { ...mockEvent.time, utc: toIso(mockEvent.time.utc) },
    });

    assert.deepEqual(repos.commands.get("cmd-20261118-0055"), {
      ...mockCommand,
      issued_at: toIso(mockCommand.issued_at),
      expires_at: toIso(mockCommand.expires_at),
      result: {
        ...mockCommand.result,
        finished_at: mockCommand.result.finished_at === null ? null : toIso(mockCommand.result.finished_at),
      },
    });

    assert.deepEqual(repos.uploads.get("file-clip-0132"), mockUpload);
  });

  test("种子数据可重复执行", () => {
    seedDemo(repos);
    seedDemo(repos);
    assert.equal(repos.jobs.list().total, 1);
    assert.equal(repos.events.listBySession(mockSession.session_id).length, 1);
  });
});

describe("设备状态与配对", () => {
  test("state_version 更小的上报被丢弃", () => {
    seedDemo(repos);
    const stale = { ...mockDeviceStatus, state_version: 41, battery_pct: 10 };

    assert.equal(repos.devices.upsertStatus(stale), false);
    assert.equal(repos.devices.getStatus("edge-01")?.battery_pct, 86);
    assert.equal(repos.devices.getStatus("edge-01")?.state_version, 42);
  });

  test("电量超出 0–100 被数据库约束拦住", () => {
    assert.throws(() => repos.devices.upsertStatus({ ...mockDeviceStatus, battery_pct: 120 }), /CHECK/);
  });

  test("新设备心跳自动登记为待配对", () => {
    repos.devices.upsertStatus({ ...mockDeviceStatus, device_id: "edge-02", state_version: 0 });
    const device = repos.devices.getDevice("edge-02");
    assert.equal(device?.pair_status, "unpaired");
  });

  test("配对码一次性、会过期，成功即置为已配对", () => {
    repos.devices.register("edge-09");
    const issued = repos.devices.issuePairCode("edge-09", "1234");
    assert.equal(issued.expires_at, toIso(new Date(new Date(issued.issued_at).getTime() + 120_000)));

    assert.deepEqual(repos.devices.consumePairCode("1234"), { ok: true, device_id: "edge-09" });
    assert.deepEqual(repos.devices.consumePairCode("1234"), { ok: false, reason: "consumed" });
    assert.equal(repos.devices.getDevice("edge-09")?.pair_status, "paired");

    const past = new Date(Date.now() - 60_000).toISOString();
    repos.devices.issuePairCode("edge-09", "5678", 1_000, past);
    assert.deepEqual(repos.devices.consumePairCode("5678"), { ok: false, reason: "expired" });
    assert.deepEqual(repos.devices.consumePairCode("0000"), { ok: false, reason: "not_found" });
  });
});

describe("任务", () => {
  test("重复 job_id 返回冲突，地点快照必须与任务场区一致", () => {
    seedDemo(repos);
    assert.throws(() => repos.jobs.create(mockJob), /任务已存在/);
    assert.throws(
      () =>
        repos.jobs.create({
          ...mockJob,
          job_id: "job-x",
          location: { ...mockJob.location, house_id: "house-b1" },
        }),
      ValidationError,
    );
  });

  test("按场区与状态筛选、分页", () => {
    seedDemo(repos);
    const page = repos.jobs.list({ farm_id: mockJob.farm_id, page: 1, page_size: 1 });
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.job_id, mockJob.job_id);
    assert.deepEqual(page.items[0]?.attachment_ids, mockJob.attachment_ids);
    assert.equal(repos.jobs.list({ status: "completed" }).total, 0);
  });
});

describe("会话评分版本", () => {
  test("复核改分递增版本并保留历史；版本回退被拒绝", () => {
    seedDemo(repos);
    const sessionId = mockSession.session_id;

    const revised = repos.sessions.saveScore(
      sessionId,
      { ...mockSession.score, status: "final", value: 66, score_version: 2 },
      "review",
    );
    assert.equal(revised.score.value, 66);
    assert.equal(revised.status, "active");

    const versions = repos.sessions.listScoreVersions(sessionId);
    assert.deepEqual(
      versions.map((v) => [v.score.score_version, v.score.value, v.reason]),
      [
        [1, 78, "initial"],
        [2, 66, "review"],
      ],
    );

    assert.throws(
      () => repos.sessions.saveScore(sessionId, { ...mockSession.score, score_version: 1 }, "provisional"),
      StaleVersionError,
    );
  });
});

describe("事件与复核", () => {
  test("复核只改复核字段并逐条留痕，原始 AI 判定不变", () => {
    seedDemo(repos);
    const reviewed = repos.events.review(mockEvent.event_id, {
      conclusion: "confirmed",
      reviewer_id: "user-huangqx",
      reviewed_at: "2026-11-18T11:00:00Z",
      remark: "动作清晰",
    });

    assert.equal(reviewed.action, mockEvent.action);
    assert.equal(reviewed.confidence, mockEvent.confidence);
    assert.equal(reviewed.review.conclusion, "confirmed");
    assert.equal(reviewed.review.reviewed_at, "2026-11-18T11:00:00.000Z");
    assert.equal(repos.events.countByReview(mockSession.session_id, "confirmed"), 1);

    repos.events.review(mockEvent.event_id, {
      conclusion: "supplemented",
      reviewer_id: "user-huangqx",
      reviewed_at: "2026-11-18T11:05:00Z",
      remark: "补充：左撇子操作",
    });

    const history = repos.events.listReviewHistory(mockEvent.event_id);
    assert.deepEqual(
      history.map((h) => [h.seq, h.conclusion]),
      [
        [1, "confirmed"],
        [2, "supplemented"],
      ],
    );
  });

  test("按设备单调时间排序事件", () => {
    seedDemo(repos);
    const later: Event = {
      ...structuredClone(mockEvent),
      event_id: "evt-later",
      time: { device_monotonic_ms: 200_000, utc: "2026-11-18T10:06:00Z" },
    };
    repos.events.insertMany([later]);

    assert.deepEqual(
      repos.events.listBySession(mockSession.session_id).map((e) => e.event_id),
      ["evt-20261118-0132", "evt-later"],
    );
  });

  test("未知会话被外键拦住", () => {
    assert.throws(
      () => repos.events.insert({ ...structuredClone(mockEvent), event_id: "evt-orphan", session_id: "sess-nope" }),
      /FOREIGN KEY/,
    );
  });
});

describe("指令", () => {
  const acceptedCommand = (overrides: Partial<Command>): Command => ({
    ...structuredClone(mockCommand),
    command_id: "cmd-test-001",
    issued_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    expires_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    result: { state: "accepted", code: null, message: null, finished_at: null },
    ...overrides,
  });

  test("超时改判 timeout，终态不被后续回执覆盖", () => {
    seedDemo(repos);
    repos.commands.create(acceptedCommand({}));

    assert.equal(repos.commands.expireOverdue(), 1);
    const expired = repos.commands.get("cmd-test-001");
    assert.equal(expired?.result.state, "timeout");
    assert.notEqual(expired?.result.finished_at, null);

    const after = repos.commands.setResult("cmd-test-001", {
      state: "completed",
      code: null,
      message: null,
      finished_at: new Date().toISOString(),
    });
    assert.equal(after.result.state, "timeout");
  });

  test("accepted 可正常回报完成", () => {
    seedDemo(repos);
    repos.commands.create(
      acceptedCommand({
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const done = repos.commands.setResult("cmd-test-001", {
      state: "completed",
      code: null,
      message: null,
      finished_at: "2026-11-18T12:00:00Z",
    });
    assert.equal(done.result.state, "completed");
    assert.equal(done.result.finished_at, "2026-11-18T12:00:00.000Z");
  });
});

describe("上传", () => {
  test("无回执不得归档；校验后可归档且不会被回退", () => {
    repos.uploads.create(badUpload());
    assert.throws(() => repos.uploads.archive("file-test-001"), ValidationError);

    assert.equal(repos.uploads.markUploading("file-test-001").attempts, 1);
    repos.uploads.verify("file-test-001", {
      receipt_id: "receipt-1",
      verified_at: "2026-11-18T13:00:00Z",
    });
    const archived = repos.uploads.archive("file-test-001");
    assert.equal(archived.status, "archived");
    assert.equal(archived.cloud_receipt?.receipt_id, "receipt-1");

    assert.equal(repos.uploads.markFailed("file-test-001", "late error").status, "archived");
  });

  test("分块数与已传字节受约束", () => {
    repos.uploads.create(badUpload());
    assert.throws(
      () =>
        repos.uploads.updateProgress("file-test-001", {
          uploaded_bytes: 0,
          chunk_size: 4_194_304,
          total_chunks: 2,
          uploaded_chunks: 3,
        }),
      /CHECK/,
    );
  });

  test("sha256 必须为 64 位小写十六进制", () => {
    assert.throws(() => repos.uploads.create(badUpload({ sha256: "abc123" })), /CHECK/);
  });
});

describe("幂等键与审计", () => {
  test("同一请求重放，指纹不同冲突，过期后重新占位", () => {
    const ttl = 60_000;
    assert.deepEqual(repos.idempotency.reserve("jobs.create", "k1", "hash-a", ttl), { kind: "new" });
    assert.deepEqual(repos.idempotency.reserve("jobs.create", "k1", "hash-a", ttl), {
      kind: "in_progress",
    });
    assert.deepEqual(repos.idempotency.reserve("jobs.create", "k1", "hash-b", ttl), {
      kind: "conflict",
    });

    repos.idempotency.complete("jobs.create", "k1", 201, '{"job_id":"x"}');
    assert.deepEqual(repos.idempotency.reserve("jobs.create", "k1", "hash-a", ttl), {
      kind: "replay",
      status_code: 201,
      response_json: '{"job_id":"x"}',
    });

    const future = new Date(Date.now() + 2 * 60_000).toISOString();
    assert.equal(repos.idempotency.cleanupExpired(future), 1);
    assert.deepEqual(repos.idempotency.reserve("jobs.create", "k1", "hash-a", ttl, future), {
      kind: "new",
    });
  });

  test("审计记录可按目标追溯", () => {
    repos.audit.append({
      actor_id: "user-huangqx",
      actor_role: "admin",
      action: "event.review",
      target_type: "event",
      target_id: mockEvent.event_id,
      detail: { conclusion: "confirmed" },
    });
    const entries = repos.audit.listByTarget("event", mockEvent.event_id);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.detail_json, '{"conclusion":"confirmed"}');
  });
});