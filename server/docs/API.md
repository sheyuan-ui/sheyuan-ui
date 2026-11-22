# HTTP 接口层

**依据**：T02 数据契约（`sheyuan-ui/sheyuan-ui` @ `9ea16e1`，`src/contracts/api.ts`）
**实现**：`src/server/`，Node.js 内置 `node:http` + `ws`，无 Web 框架
**数据**：`src/repos/` 访问层；所有响应体都是契约对象（snake_case）

## 1. 启动

```bash
npm run db      # 首次：迁移 + 演示数据
npm run serve   # 默认 http://0.0.0.0:8080
```

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址；现场局域网需要外部设备访问 |
| `HELMET_HUB_DB` | `data/helmet-hub.db` | SQLite 文件；启动时自动迁移 |
| `HELMET_HUB_UPLOAD_DIR` | `data/uploads` | 分块落盘目录，首个分块写入时创建 |
| `HELMET_HUB_TOKEN` | 未设置 | 设置后 `/api` 与 `/ws` 必须携带令牌 |

设置令牌后，HTTP 使用 `Authorization: Bearer <token>`，WebSocket 使用 `?token=<token>`。
`/healthz` 不受令牌保护，供探活使用。

## 2. 响应外壳

成功（HTTP 状态与语义一致）：

```json
{
  "data": { "device_id": "edge-01" },
  "request_id": "9c0f2d1e-..."
}
```

失败：

```json
{
  "code": "CONFLICT",
  "message": "设备状态已变化，请刷新后重试",
  "request_id": "9c0f2d1e-...",
  "details": { "expected_state_version": "41", "current_state_version": "42" }
}
```

- 请求头带 `X-Request-Id` 时原样回显，否则服务端生成 UUID；响应头同样返回。
- 前端按 `code` 分支，不比对中文文案。错误码表与 HTTP 状态取自 `src/contracts/errors.ts`。
- `details` 仅用于字段级或冲突详情，可缺省。

## 3. 接口清单

路径常量全部来自 `API`，实现中不另写字符串。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/devices` | 设备总览：`DeviceSummary[]`（配对态 + 别名 + 最新状态） |
| GET | `/api/devices/{id}` | 单台设备总览；不存在 404 |
| GET | `/api/devices/{id}/status` | 最新 `DeviceStatus`；设备存在但未上报 404 |
| GET | `/api/devices/{id}/sessions?limit=` | 该设备会话，按开始时间倒序，`limit` 1–200，默认 50 |
| POST | `/api/devices/pair-code` | 签发 4 位配对码，返回 `{ code, device_id, issued_at, expires_at }` |
| POST | `/api/devices/pair` | 消费配对码，成功返回 `{ device_id, pair_status: "paired" }` |
| POST | `/api/devices/{id}/preview/offer` | 预览转发未接入（WEB-03/06），返回 502 `DEVICE_UNREACHABLE` |
| GET | `/api/jobs` | 任务分页列表，支持场区/栋舍/批次/场景/状态/创建时间过滤 |
| POST | `/api/jobs` | 创建任务，201 |
| GET | `/api/jobs/{id}` | 任务详情 |
| POST | `/api/jobs/{id}/attachments` | 追加附件 ID（`file_id`），重复追加幂等 |
| GET | `/api/sessions` | 会话分页列表，支持 `job_id` / `device_id` / `status` / 开始时间过滤 |
| GET | `/api/sessions/{id}` | 会话详情 |
| GET | `/api/sessions/{id}/events` | 会话内事件，按 `device_monotonic_ms` 排序 |
| POST | `/api/events/{id}/review` | 人工复核，只改 `review_*` 并留痕 |
| POST | `/api/commands` | 下发指令，201；版本不一致 409 |
| GET | `/api/commands/{id}` | 指令详情与执行结果 |
| POST | `/api/uploads` | 登记上传元数据，201 |
| GET | `/api/uploads/{id}` | 上传进度与状态 |
| POST | `/api/uploads/{id}/chunks?chunk_index=` | 上传一个分块（二进制） |
| POST | `/api/uploads/{id}/complete` | 校验本地文件并置为 `verified` |
| GET | `/healthz` | `{ status: "ok", now }`，不鉴权 |

分页响应统一为 `{ items, page, page_size, total }`，默认 `page=1`、`page_size=50`，上限 200。

## 4. 写接口幂等

除 GET 外所有接口（含分块与完成）必须携带 `Idempotency-Key`，否则 400 `INVALID_ARGUMENT`。

- 同键 + 同请求 → 重放首次成功响应（状态码与 `data` 一致）；
- 同键 + 不同请求 → 409 `CONFLICT`；
- 同一键正在处理 → 409 `CONFLICT`，客户端稍后重试；
- 处理失败时释放占位，允许用同一键重试。

幂等作用域按业务拆分（`jobs.create`、`commands.create`、`uploads.chunk` 等），
不同接口可复用同一个键值而不互相干扰。键默认保留 24 小时。

分块请求的指纹由 `文件 ID + chunk_index + Content-Length` 组成；
同一分块重传且长度一致时直接返回当前进度，不重复落盘。

## 5. 关键校验

| 场景 | 行为 |
| --- | --- |
| 指令 `expected_state_version` 与设备最新版本不一致 | 409，`details` 给出期望值与当前值 |
| 设备存在但从未上报状态 | 409，不能凭猜测的版本下发指令 |
| 配对码不存在 | 400 `INVALID_ARGUMENT` |
| 配对码过期 | 400 `INVALID_ARGUMENT` |
| 配对码已使用 | 409 `CONFLICT` |
| 上传 `sha256` 不是 64 位小写十六进制 | 400 |
| 分块越界或超过 `chunk_size` | 400 / 413 |
| 完成时仍有分块缺失 | 409，`details.missing_chunks` |
| 本地文件 SHA-256 与声明不一致 | 422 `UPLOAD_HASH_MISMATCH`，状态置 `failed` |
| 任务/会话/事件不存在 | 404 |

时间入参必须是 ISO 8601；入库统一规范为 `YYYY-MM-DDTHH:mm:ss.sssZ`。
未知值用 `null`，接口不会用 0 或空串顶替。

## 6. 上传流程

1. `POST /api/uploads` 登记 `size_bytes`、`sha256`、`kind`；
   `chunk_size` 缺省 4 MiB（上限 64 MiB），服务端算出 `total_chunks`。
2. 按 `chunk_index` 从 0 开始 `POST .../chunks?chunk_index=N`，请求体为原始字节。
   落盘位置为 `<upload_dir>/<file_id>.part` 的第 `N * chunk_size` 字节。
3. `POST .../complete`：确认分块收齐后计算本地文件 SHA-256；
   一致则 `pending/uploading → verified`，不一致则 `failed` 并返回 422。

`cloud_receipt` 由云端校验回执写入（仓储 `verify()`），T02 未定义对应 HTTP 路径；
无回执时不会出现 `archived`。

## 7. WebSocket

- 地址：`ws://<host>:<port>/ws`
- 查询参数 `topics=a,b` 指定订阅；缺省订阅全部，未知主题直接关闭（1008）。
- 连接成功后服务端先发 `{ "type": "ready", "topics": [...] }`。
- 运行中可发送 `{ "type": "subscribe" | "unsubscribe", "topics": [...] }`。

推送消息：

```json
{
  "topic": "upload.progress",
  "data": { "file_id": "file-clip-0132", "progress": { "uploaded_chunks": 2, "...": "..." } },
  "sent_at": "2026-11-18T10:31:07.123Z"
}
```

当前已推送：`upload.progress`（每个分块落盘、完成校验时）。
`device.status` / `device.events` / `command.result` 需要在设备接入链路（WEB-03/06）就位后，
在对应写入点调用 `hub.publish()`；订阅与鉴权已就绪。

## 8. 实现位置

| 文件 | 作用 |
| --- | --- |
| `src/server/create-server.ts` | HTTP 服务、CORS、请求 ID、令牌、统一响应与错误 |
| `src/server/router.ts` | 方法 + 路径模板匹配，`:param` 解码 |
| `src/server/body.ts` | JSON 请求体解析（1 MB 上限） |
| `src/server/idempotency.ts` | 幂等校验与重放 |
| `src/server/validate.ts` / `query.ts` | 请求体与查询参数校验 |
| `src/server/hub.ts` | WebSocket 主题订阅与推送 |
| `src/server/handlers/*.ts` | 六对象与上传接口 |
| `src/cli/serve.ts` | 启动入口（自动迁移、优雅关闭） |

集成测试见 `tests/api.test.ts`：响应外壳、幂等重放/冲突、乐观锁、配对、复核留痕、
分块上传 + SHA-256、WebSocket 推送、令牌保护。