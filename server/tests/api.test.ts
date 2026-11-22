import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { WebSocket, type RawData } from "ws";
import { mockJob } from "../src/contracts/mock.ts";
import { migrate, openDatabase } from "../src/db/index.ts";
import type { Db } from "../src/db/open.ts";
import { createRepositories } from "../src/repos/index.ts";
import { DEMO_IDS, seedDemo } from "../src/seed/demo.ts";
import { createHelmetServer, type HelmetServer } from "../src/server/index.ts";

const migrationsDir = join(import.meta.dirname, "../src/db/migrations");

let db: Db;
let app: HelmetServer;
let baseUrl: string;
let wsUrl: string;
let uploadDir: string;

function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", ...extra };
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, headers: res.headers, body };
}

function postJson(path: string, payload: unknown, key?: string, headers: Record<string, string> = {}) {
  return call(path, {
    method: "POST",
    headers: jsonHeaders(key === undefined ? headers : { ...headers, "idempotency-key": key }),
    body: JSON.stringify(payload),
  });
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("等待 WebSocket 消息超时"));
    }, 3_000);
    function onMessage(raw: RawData): void {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

before(async () => {
  db = openDatabase({ file: ":memory:" });
  migrate(db, migrationsDir);
  seedDemo(createRepositories(db));

  uploadDir = await mkdtemp(join(tmpdir(), "helmet-hub-uploads-"));
  app = createHelmetServer({ db, uploadDir, logger: () => {} });
  const address = await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${address.port}`;
  wsUrl = `ws://127.0.0.1:${address.port}/ws`;
});

after(async () => {
  await app.close();
  db.close();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("响应外壳与请求 ID", () => {
  test("成功响应为 { data, request_id }，并回显 X-Request-Id", async () => {
    const { status, headers, body } = await call("/api/devices", {
      headers: { "x-request-id": "req-fixed-001" },
    });
    assert.equal(status, 200);
    assert.equal(body.request_id, "req-fixed-001");
    assert.equal(headers.get("x-request-id"), "req-fixed-001");
    assert.equal(headers.get("access-control-allow-origin"), "*");
    assert.ok(Array.isArray(body.data));
  });

  test("未知路径返回 404 与错误码", async () => {
    const { status, body } = await call("/api/does-not-exist");
    assert.equal(status, 404);
    assert.equal(body.code, "NOT_FOUND");
    assert.equal(typeof body.message, "string");
    assert.equal(typeof body.request_id, "string");
    assert.equal("data" in body, false);
  });

  test("健康检查不受业务数据影响", async () => {
    const { status, body } = await call("/healthz");
    assert.equal(status, 200);
    assert.equal((body.data as { status: string }).status, "ok");
  });

  test("根路径返回自带验证页", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await res.text(), /验证台/);
  });
});

describe("设备与配对", () => {
  test("签发配对码后配对一次成功，再次使用返回 409", async () => {
    const issued = await postJson(
      "/api/devices/pair-code",
      { device_id: "edge-api-pair", code: "4321" },
      "pair-code-1",
    );
    assert.equal(issued.status, 201);
    const pairCode = issued.body.data as { code: string; expires_at: string };
    assert.equal(pairCode.code, "4321");
    assert.ok(pairCode.expires_at > (issued.body.data as { issued_at: string }).issued_at);

    const paired = await postJson("/api/devices/pair", { code: "4321" }, "pair-1");
    assert.equal(paired.status, 200);
    assert.deepEqual(paired.body.data, { device_id: "edge-api-pair", pair_status: "paired" });

    const again = await postJson("/api/devices/pair", { code: "4321" }, "pair-2");
    assert.equal(again.status, 409);
    assert.equal(again.body.code, "CONFLICT");

    const detail = await call("/api/devices/edge-api-pair");
    assert.equal(detail.status, 200);
    assert.equal((detail.body.data as { pair_status: string }).pair_status, "paired");
  });

  test("不存在的设备返回 404", async () => {
    const { status, body } = await call("/api/devices/no-such-device/status");
    assert.equal(status, 404);
    assert.equal(body.code, "NOT_FOUND");
  });
});

describe("任务与附件", () => {
  test("同一幂等键重放返回同一任务，不同请求体返回 409", async () => {
    const job = { ...structuredClone(mockJob), job_id: "job-api-001", attachment_ids: [] };
    const first = await postJson("/api/jobs", job, "job-create-1");
    assert.equal(first.status, 201);
    assert.equal((first.body.data as { job_id: string }).job_id, "job-api-001");

    const replay = await postJson("/api/jobs", job, "job-create-1");
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.body.data, first.body.data);

    const conflict = await postJson("/api/jobs", { ...job, job_id: "job-api-002" }, "job-create-1");
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "CONFLICT");

    const missingKey = await postJson("/api/jobs", job);
    assert.equal(missingKey.status, 400);
    assert.equal(missingKey.body.code, "INVALID_ARGUMENT");
  });

  test("追加附件后可读回，重复追加保持幂等", async () => {
    const added = await postJson(
      "/api/jobs/job-api-001/attachments",
      { file_id: "file-attach-api-1" },
      "job-attach-1",
    );
    assert.equal(added.status, 200);
    assert.deepEqual((added.body.data as { attachment_ids: string[] }).attachment_ids, [
      "file-attach-api-1",
    ]);

    const again = await postJson(
      "/api/jobs/job-api-001/attachments",
      { file_id: "file-attach-api-1" },
      "job-attach-2",
    );
    assert.equal(again.status, 200);
    assert.deepEqual((again.body.data as { attachment_ids: string[] }).attachment_ids, [
      "file-attach-api-1",
    ]);

    const fetched = await call("/api/jobs/job-api-001");
    assert.equal(fetched.status, 200);
    assert.equal((fetched.body.data as { job_id: string }).job_id, "job-api-001");
  });

  test("列表支持分页并返回 total", async () => {
    const { status, body } = await call("/api/jobs?page=1&page_size=1");
    assert.equal(status, 200);
    const page = body.data as { items: unknown[]; page: number; page_size: number; total: number };
    assert.equal(page.page, 1);
    assert.equal(page.page_size, 1);
    assert.equal(page.items.length, 1);
    assert.ok(page.total >= 2);
  });
});

describe("会话与事件复核", () => {
  test("按设备查会话，按会话查事件", async () => {
    const sessions = await call(`/api/sessions?device_id=${DEMO_IDS.device}`);
    assert.equal(sessions.status, 200);
    const items = (sessions.body.data as { items: { session_id: string }[] }).items;
    assert.ok(items.some((item) => item.session_id === DEMO_IDS.session));

    const events = await call(`/api/sessions/${DEMO_IDS.session}/events`);
    assert.equal(events.status, 200);
    const list = events.body.data as { event_id: string; review: { conclusion: string } }[];
    const target = list.find((item) => item.event_id === DEMO_IDS.event);
    assert.ok(target);
    assert.equal(target.review.conclusion, "pending");

    const missing = await call("/api/sessions/sess-missing/events");
    assert.equal(missing.status, 404);
  });

  test("复核写入结论与留痕，原始 AI 字段不变", async () => {
    const reviewed = await postJson(
      `/api/events/${DEMO_IDS.event}/review`,
      { conclusion: "confirmed", remark: "人工确认" },
      "event-review-1",
      { "x-actor-id": "user-reviewer" },
    );
    assert.equal(reviewed.status, 200);
    const event = reviewed.body.data as {
      action: string;
      confidence: number;
      review: { conclusion: string; reviewer_id: string; reviewed_at: string; remark: string };
    };
    assert.equal(event.action, "grab");
    assert.equal(event.confidence, 0.91);
    assert.equal(event.review.conclusion, "confirmed");
    assert.equal(event.review.reviewer_id, "user-reviewer");
    assert.ok(event.review.reviewed_at);
    assert.equal(event.review.remark, "人工确认");

    const stored = createRepositories(db).events.get(DEMO_IDS.event);
    assert.equal(stored?.review.conclusion, "confirmed");
    const history = createRepositories(db).events.listReviewHistory(DEMO_IDS.event);
    assert.equal(history.at(-1)?.conclusion, "confirmed");

    const audit = createRepositories(db).audit.listByTarget("event", DEMO_IDS.event);
    assert.ok(audit.some((entry) => entry.action === "event.review"));

    const missing = await postJson(
      "/api/events/evt-missing/review",
      { conclusion: "rejected" },
      "event-review-missing",
    );
    assert.equal(missing.status, 404);
  });
});

describe("指令与乐观锁", () => {
  test("版本一致创建指令，版本不一致返回 409", async () => {
    const created = await postJson(
      "/api/commands",
      {
        device_id: DEMO_IDS.device,
        session_id: DEMO_IDS.session,
        expected_state_version: 42,
        action: "pause_job",
      },
      "command-create-1",
    );
    assert.equal(created.status, 201);
    const command = created.body.data as {
      command_id: string;
      result: { state: string };
      issued_at: string;
      expires_at: string;
    };
    assert.equal(command.result.state, "accepted");
    assert.ok(command.expires_at > command.issued_at);

    const stale = await postJson(
      "/api/commands",
      { device_id: DEMO_IDS.device, expected_state_version: 41, action: "resume_job" },
      "command-create-2",
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "CONFLICT");
    assert.equal((stale.body.details as Record<string, string>).current_state_version, "42");

    const fetched = await call(`/api/commands/${command.command_id}`);
    assert.equal(fetched.status, 200);
    assert.equal((fetched.body.data as { command_id: string }).command_id, command.command_id);

    const unknown = await postJson(
      "/api/commands",
      { device_id: "no-such-device", expected_state_version: 0, action: "reboot" },
      "command-create-3",
    );
    assert.equal(unknown.status, 404);
  });
});

describe("上传分块、校验与推送", () => {
  test("分块上传可重放，收齐后 SHA-256 校验通过并推送进度", async () => {
    const content = Buffer.from("hello helmet");
    const sha256 = createHash("sha256").update(content).digest("hex");

    const created = await postJson(
      "/api/uploads",
      {
        file_id: "file-api-001",
        owner_id: DEMO_IDS.device,
        kind: "event_clip",
        size_bytes: content.length,
        sha256,
        chunk_size: 5,
      },
      "upload-create-1",
    );
    assert.equal(created.status, 201);
    const upload = created.body.data as {
      status: string;
      progress: { total_chunks: number; uploaded_chunks: number; chunk_size: number };
    };
    assert.equal(upload.status, "pending");
    assert.equal(upload.progress.total_chunks, 3);
    assert.equal(upload.progress.chunk_size, 5);

    const socket = new WebSocket(`${wsUrl}?topics=upload.progress`);
    const ready = await new Promise<Record<string, unknown>>((resolve, reject) => {
      socket.once("message", (raw) => resolve(JSON.parse(raw.toString())));
      socket.once("error", reject);
    });
    assert.deepEqual(ready.topics, ["upload.progress"]);

    const progressMessage = waitForMessage(socket, (message) => {
      if (message.topic !== "upload.progress") return false;
      const data = message.data as { file_id: string; progress: { uploaded_chunks: number } };
      return data.file_id === "file-api-001" && data.progress.uploaded_chunks === 3;
    });

    for (let index = 0; index < 3; index += 1) {
      const part = content.subarray(index * 5, Math.min((index + 1) * 5, content.length));
      const res = await fetch(`${baseUrl}/api/uploads/file-api-001/chunks?chunk_index=${index}`, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "idempotency-key": `upload-chunk-${index}`,
        },
        body: part,
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { progress: { uploaded_chunks: number } };
      };
      assert.equal(body.data.progress.uploaded_chunks, index + 1);
    }

    const pushed = await progressMessage;
    const pushedData = pushed.data as { file_id: string; progress: { uploaded_chunks: number } };
    assert.equal(pushedData.file_id, "file-api-001");
    assert.equal(pushedData.progress.uploaded_chunks, 3);

    const replay = await fetch(`${baseUrl}/api/uploads/file-api-001/chunks?chunk_index=0`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "idempotency-key": "upload-chunk-0",
      },
      body: content.subarray(0, 5),
    });
    assert.equal(replay.status, 200);

    const completed = await fetch(`${baseUrl}/api/uploads/file-api-001/complete`, {
      method: "POST",
      headers: { "idempotency-key": "upload-complete-1" },
    });
    assert.equal(completed.status, 200);
    const verified = (await completed.json()) as { data: { status: string } };
    assert.equal(verified.data.status, "verified");

    const fetched = await call("/api/uploads/file-api-001");
    assert.equal((fetched.body.data as { status: string }).status, "verified");

    socket.close();
  });

  test("分块未收齐时不能完成", async () => {
    const content = Buffer.from("abc");
    const sha256 = createHash("sha256").update(content).digest("hex");
    await postJson(
      "/api/uploads",
      {
        file_id: "file-api-002",
        owner_id: DEMO_IDS.device,
        kind: "screenshot",
        size_bytes: content.length,
        sha256,
        chunk_size: 2,
      },
      "upload-create-2",
    );

    const completed = await fetch(`${baseUrl}/api/uploads/file-api-002/complete`, {
      method: "POST",
      headers: { "idempotency-key": "upload-complete-2" },
    });
    assert.equal(completed.status, 409);
    const body = (await completed.json()) as { code: string; details: { missing_chunks: string } };
    assert.equal(body.code, "CONFLICT");
    assert.equal(body.details.missing_chunks, "2");
  });

  test("SHA-256 不匹配返回 422 并标记失败", async () => {
    const content = Buffer.from("abc");
    await postJson(
      "/api/uploads",
      {
        file_id: "file-api-003",
        owner_id: DEMO_IDS.device,
        kind: "screenshot",
        size_bytes: content.length,
        sha256: "0".repeat(64),
        chunk_size: 4,
      },
      "upload-create-3",
    );

    const chunk = await fetch(`${baseUrl}/api/uploads/file-api-003/chunks?chunk_index=0`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "idempotency-key": "upload-chunk-3",
      },
      body: content,
    });
    assert.equal(chunk.status, 200);

    const completed = await fetch(`${baseUrl}/api/uploads/file-api-003/complete`, {
      method: "POST",
      headers: { "idempotency-key": "upload-complete-3" },
    });
    assert.equal(completed.status, 422);
    const body = (await completed.json()) as { code: string };
    assert.equal(body.code, "UPLOAD_HASH_MISMATCH");

    const fetched = await call("/api/uploads/file-api-003");
    assert.equal((fetched.body.data as { status: string }).status, "failed");
  });

  test("非法元数据与越界分块被拒绝", async () => {
    const badHash = await postJson(
      "/api/uploads",
      {
        owner_id: DEMO_IDS.device,
        kind: "screenshot",
        size_bytes: 1,
        sha256: "not-a-hash",
      },
      "upload-create-bad-hash",
    );
    assert.equal(badHash.status, 400);

    const badKind = await postJson(
      "/api/uploads",
      {
        owner_id: DEMO_IDS.device,
        kind: "video",
        size_bytes: 1,
        sha256: "a".repeat(64),
      },
      "upload-create-bad-kind",
    );
    assert.equal(badKind.status, 400);

    const outOfRange = await fetch(
      `${baseUrl}/api/uploads/file-api-001/chunks?chunk_index=9`,
      {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "idempotency-key": `upload-chunk-oor-${randomUUID()}`,
        },
        body: Buffer.from("x"),
      },
    );
    assert.equal(outOfRange.status, 400);
  });
});

describe("可选令牌保护", () => {
  test("设置了 HELMET_HUB_TOKEN 时 /api 需要 Bearer 令牌", async () => {
    const tokenDb = openDatabase({ file: ":memory:" });
    migrate(tokenDb, migrationsDir);
    const tokenApp = createHelmetServer({
      db: tokenDb,
      uploadDir,
      token: "secret-token",
      logger: () => {},
    });
    const address = await tokenApp.listen(0, "127.0.0.1");
    const root = `http://127.0.0.1:${address.port}`;

    try {
      const denied = await fetch(`${root}/api/devices`);
      assert.equal(denied.status, 401);
      const body = (await denied.json()) as { code: string };
      assert.equal(body.code, "UNAUTHORIZED");

      const allowed = await fetch(`${root}/api/devices`, {
        headers: { authorization: "Bearer secret-token" },
      });
      assert.equal(allowed.status, 200);

      const health = await fetch(`${root}/healthz`);
      assert.equal(health.status, 200);
    } finally {
      await tokenApp.close();
      tokenDb.close();
    }
  });
});