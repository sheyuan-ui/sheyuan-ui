# 数据接口定义_JSON v1.0

> 适用系统：抓鸡作业智能头盔 · Pad（Web）端 ↔ 现场管理服务
> 依据：T02 数据契约（`src/contracts/types.ts` / `api.ts` / `errors.ts` / `schema.ts`）
> 维护：黄庆宣　　版本：v1.0　　日期：2026-11-26
> 设备侧协议（RTSP、命令应答、串口）见方明《设备接口定义》，本文档不重复定义。

---

## 1. 适用范围与边界

| 项 | 说明 |
| --- | --- |
| 本文档定义 | Pad 浏览器与现场管理服务之间的 HTTP 与 WebSocket 接口 |
| 不包含 | 设备内部协议、RTSP 拉流参数、云端存储对接细节 |
| 字段权威来源 | `src/contracts/types.ts`；文档与代码冲突时以代码为准 |
| 设备侧接口 | 设备注册与心跳同样由本服务提供，见第 8 节（需方明按此实现上报） |

---

## 2. 通用约定

### 2.1 基地址

```
http://<现场机器 IP>:8080
ws://<现场机器 IP>:8080/ws
```

局域网内部署，iPad 与控制端须处于同一网段；默认端口 8080，可用环境变量 `PORT` 覆盖。

### 2.2 命名与格式

| 项 | 约定 |
| --- | --- |
| 字段命名 | 全 `snake_case`，前后端一致，不转驼峰 |
| 时间 | UTC ISO 8601，带毫秒，如 `2026-11-26T09:27:14.298Z` |
| 时长 | 毫秒整数，字段名以 `_ms` 结尾 |
| 未知值 | 一律 `null`，**禁止用 0 顶替**（电量 0 是有效值） |
| 标识 | 字符串；`device_id` 建议等于设备 SN（待方明确认） |

### 2.3 请求头

| 头 | 必填 | 用途 |
| --- | --- | --- |
| `Authorization: Bearer <access_token>` | 人账号接口必填 | 身份认证 |
| `X-Device-Token: <token>` | 设备注册/心跳必填 | 设备认证，不与人账号混用 |
| `Idempotency-Key` | 写接口建议填 | 幂等，重试不产生重复任务或指令 |
| `X-Request-Id` | 可选 | 链路追踪；不传则服务端生成并回显 |

### 2.4 响应外壳

成功：

```json
{ "data": { }, "request_id": "9c0f2d1e-..." }
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

- 前端按 `code` 分支，**不比对中文文案**
- `details` 可选，仅用于字段级错误或冲突详情

### 2.5 错误码表

| code | HTTP | 含义 |
| --- | --- | --- |
| INVALID_ARGUMENT | 400 | 参数不合法 |
| UNAUTHORIZED | 401 | 未登录或令牌过期 |
| FORBIDDEN | 403 | 角色不足 |
| NOT_FOUND | 404 | 资源不存在 |
| CONFLICT | 409 | 状态已变化 / 幂等冲突 |
| DEVICE_REJECTED | 409 | 设备拒绝执行 |
| COMMAND_EXPIRED | 410 | 指令过期 |
| PAYLOAD_TOO_LARGE | 413 | 分块超限 |
| UNSUPPORTED_MEDIA_TYPE | 415 | 不支持的文件类型 |
| UPLOAD_HASH_MISMATCH | 422 | 文件校验失败 |
| RATE_LIMITED | 429 | 请求过于频繁 |
| INTERNAL | 500 | 服务内部错误 |
| DEVICE_UNREACHABLE | 502 | 设备当前不可达 |

### 2.6 分页

列表接口统一支持 `page`（从 1 起）与 `page_size`（1–200，默认 50），返回：

```json
{ "items": [], "page": 1, "page_size": 50, "total": 0 }
```

---

## 3. 认证与权限

### 3.1 接口

| 方法 | 路径 | 权限 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | 公开 | `username`、`password` | `access_token`、`token_type`、`expires_in`、`refresh_token`、`refresh_expires_in`、`user` |
| POST | `/api/auth/refresh` | 公开 | `refresh_token` | 同登录（新令牌对） |
| POST | `/api/auth/logout` | operator | `refresh_token` | `{ revoked: boolean }` |
| GET | `/api/auth/me` | viewer | — | `user_id`、`username`、`display_name`、`role` |
| GET | `/api/audit?limit=` | admin | — | 审计记录数组 |

`expires_in` 为秒（默认 900）；刷新令牌默认 30 天，每次刷新轮换，旧令牌再次使用视为泄露并吊销该账号全部令牌。

### 3.2 角色矩阵

| 角色 | 等级 | 能力 |
| --- | --- | --- |
| viewer | 1 | 所有 GET 查询 |
| operator | 2 | viewer 全部 + 写操作（建任务、下发指令、复核、上传、配对） |
| admin | 3 | operator 全部 + 审计查询 |

- GET 需 viewer；POST/PUT/PATCH/DELETE 需 operator；`/api/audit` 仅 admin
- 高等级自动满足低等级
- 未带令牌 401；等级不足 403，`details` 带 `required_role`、`current_role`
- 本地演示可设 `HELMET_HUB_AUTH=off` 关闭强制鉴权（正式环境必须开启）

### 3.3 设备认证

设备注册与心跳只校验 `X-Device-Token`，不进入人账号角色矩阵。未配置 `HELMET_HUB_DEVICE_TOKEN` 时放行并告警一次，仅限联调。

---

## 4. 核心对象

字段以 `src/contracts/types.ts` 为准，此处仅列接口传输所需字段。

### 4.1 DeviceStatus（设备自报快照）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| device_id | string | 设备标识 |
| model | string | 型号 |
| firmware_version | string | 固件版本 |
| battery_pct | number \| null | 0–100，不可读为 `null` |
| wifi | object | `connected`、`ssid`、`rssi_dbm`（可 null） |
| hub_reachable | boolean | 设备自报能否访问管理服务 |
| cloud_reachable | boolean | 设备自报能否访问云端 |
| task_state | enum | idle / starting / recording / paused / stopping / error |
| storage_free_bytes | number | 剩余存储（字节） |
| last_seen | ISO | 设备上报时刻 |
| state_version | number | 乐观锁版本，每次变更 +1 |

### 4.2 DeviceRuntimeView（四态派生，不入库）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| state | enum | running / online / offline / fault |
| reason | enum | task_active / idle / heartbeat_timeout / never_seen / device_error / hub_unreachable |
| online | boolean | 服务端是否收到有效心跳 |
| last_seen | ISO \| null | 最后一次心跳时刻（服务端时钟） |
| offline_since | ISO \| null | 本次离线起点 |
| offline_ms | number \| null | 已离线时长 |

派生优先级：**离线 > 故障 > 运行中 > 在线**；离线时设备最后快照不作为故障依据。

### 4.3 DeviceSummary（列表/详情返回）

```json
{
  "device_id": "edge-01",
  "alias": "东栋头盔",
  "pair_status": "paired",
  "status": { },
  "runtime": { "state": "running", "reason": "task_active" }
}
```

`status` 为 4.1 快照，可为 `null`（刚注册未上报）；`runtime` 为 4.2。

### 4.4 Job / Session / Event / Command / Upload

字段见契约文件，摘要：

| 对象 | 关键字段 |
| --- | --- |
| Job | job_id、farm_id、house_id、scenario、batch_id、owner_name、location、attachment_ids、status、remark、created_at |
| Session | session_id、job_id、device_id、operator_id、started_at、ended_at、status、clock_quality、clock_offset_ms、score |
| Event | event_id、session_id、time{device_monotonic_ms, utc}、action、confidence、rule_id、evaluability、clip{start_ms,end_ms}、review |
| Command | command_id、device_id、session_id、expected_state_version、action、issued_at、expires_at、result{state,code,message,finished_at} |
| Upload | file_id、owner_id、job_id、session_id、kind、size_bytes、sha256、progress、status、cloud_receipt、attempts、last_error |
| EvaluationReport | task_id、scene、total_score、score_status、operations[]、score_version、received_at |

---

## 5. HTTP 接口清单

### 5.1 设备

| 方法 | 路径 | 权限 | 请求 | 响应 / 说明 |
| --- | --- | --- | --- | --- |
| GET | `/api/devices` | viewer | — | DeviceSummary[]（含 runtime） |
| GET | `/api/devices/:id` | viewer | — | DeviceSummary |
| GET | `/api/devices/:id/status` | viewer | — | DeviceStatus 原始快照 |
| GET | `/api/devices/:id/sessions?limit=` | viewer | limit 1–200 | Session[] |
| POST | `/api/devices/register` | X-Device-Token | device_id、model、firmware_version、alias? | 201 首次 / 200 重复；返回 server_time、heartbeat_interval_ms、offline_timeout_ms |
| POST | `/api/devices/:id/heartbeat` | X-Device-Token | 见 8.2 | accepted、state_version、task_state、server_time、策略 |
| POST | `/api/devices/pair-code` | operator | device_id、code?、ttl_ms? | 配对码、issued_at、expires_at |
| POST | `/api/devices/pair` | operator | code、ip_address? | device_id、pair_status |
| POST | `/api/devices/:id/preview/offer` | operator | SDP offer（T10 定义） | 当前返回 502 DEVICE_UNREACHABLE |

### 5.2 任务

| 方法 | 路径 | 权限 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| GET | `/api/jobs` | viewer | farm_id、house_id、batch_id、scenario、status、created_from、created_to、page、page_size | `Page<Job>` |
| POST | `/api/jobs` | operator | Job 必填字段（job_id 可省） | 201 Job |
| GET | `/api/jobs/:id` | viewer | — | Job |
| POST | `/api/jobs/:id/attachments` | operator | file_id | Job（含附件） |

### 5.3 会话与事件

| 方法 | 路径 | 权限 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| GET | `/api/sessions` | viewer | job_id、device_id、status、started_from、started_to、分页 | `Page<Session>` |
| GET | `/api/sessions/:id` | viewer | — | Session |
| GET | `/api/sessions/:id/events` | viewer | — | Event[] |
| GET | `/api/sessions/:id/evaluation?version=` | viewer | — | EvaluationReport（最新或指定版本） |
| PUT | `/api/sessions/:id/evaluation` | operator | EvaluationReportInput | EvaluationReport（版本 +1） |
| POST | `/api/events/:id/review` | operator | conclusion、remark?、reviewed_at? | Event |

复核结论取 `pending / confirmed / rejected / supplemented`；非 pending 时由服务端写入 `reviewer_id` 与 `reviewed_at`。

### 5.4 指令

| 方法 | 路径 | 权限 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| POST | `/api/commands` | operator | device_id、action、expected_state_version、session_id?、ttl_ms? | 201 Command |
| GET | `/api/commands/:id` | viewer | — | Command |

`action`：start_job / pause_job / resume_job / end_job / snapshot / sync_time / reboot。
`expected_state_version` 与设备当前版本不一致返回 409（`details` 带双方版本）；`ttl_ms` 默认 10000。

### 5.5 上传

| 方法 | 路径 | 权限 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| POST | `/api/uploads` | operator | file_id?、owner_id、job_id?、session_id?、kind、size_bytes、sha256、chunk_size? | 201 Upload |
| GET | `/api/uploads/:id` | viewer | — | Upload |
| POST | `/api/uploads/:id/chunks?chunk_index=` | operator | 二进制分块体 | Upload（进度更新） |
| POST | `/api/uploads/:id/complete` | operator | — | Upload（status=verified） |

规则：`sha256` 必须 64 位小写十六进制；分块默认 4MB、上限 64MB；缺块返回 409；哈希不符返回 422 并标记失败；`status=archived` 仅在有云端回执后出现。

### 5.6 其他

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/healthz` | 探活，返回 `{ status, now }` |
| GET | `/` | 内置演示页 |

---

## 6. 枚举与状态规则

| 枚举 | 取值 |
| --- | --- |
| DeviceTaskState | idle / starting / recording / paused / stopping / error |
| DeviceRuntimeState | running / online / offline / fault |
| JobStatus | created / dispatched / running / paused / completed / cancelled |
| SessionStatus | active / ended / aborted |
| ClockQuality | synced / unsynced / drift |
| ScoreStatus | provisional / final / unavailable |
| Evaluability | evaluable / low_confidence / not_evaluable |
| ReviewConclusion | pending / confirmed / rejected / supplemented |
| CommandOutcome | accepted / completed / rejected / timeout / failed |
| EvaluationScoreStatus | scoring_not_defined / insufficient_data / scored |
| RuleResultOutcome | compliant / noncompliant / unknown / not_applicable |
| UploadStatus | pending / uploading / failed / verified / archived |

约定：

1. 评分数据不足时 `score.value = null`，界面显示 `--`，不默认 100
2. `clock_quality ≠ synced` 时不得对外声称帧级同步
3. 指令的 `rejected` 与 `timeout` 必须区分，界面提示不同
4. 无 `cloud_receipt` 的文件不得显示“已归档”

---

## 7. WebSocket

### 7.1 连接

```
ws://<host>:8080/ws?topics=device.status,upload.progress
```

消息格式：

```json
{ "topic": "device.status", "data": { } }
```

### 7.2 主题

| 主题 | 状态 | 负载 |
| --- | --- | --- |
| `device.status` | 已实现 | device_id、online、last_seen、state、state_reason、task_state?、offline_since? |
| `upload.progress` | 已实现 | 完整 Upload 对象 |
| `device.events` | 预留（T10/T11） | 待定义 |
| `command.result` | 预留（T15） | 待定义 |

### 7.3 客户端要求

- 断线指数退避重连（1s → 2s → 4s，上限 30s）
- 重连后先拉一次列表接口补齐增量，不依赖推送补历史
- 只在状态翻转时推送，前端不得依赖“周期性消息”判断在线

---

## 8. 设备侧接口（需方明实现）

以下两个接口由本服务提供，设备按此上报；字段命名与我们保持一致，差异在接入层适配。

### 8.1 注册

`POST /api/devices/register`，请求头 `X-Device-Token`。

```json
{
  "device_id": "SY-HELMET-0001",
  "model": "SY-Helmet Edge",
  "firmware_version": "v1.4.2",
  "alias": null
}
```

首次返回 201，重复返回 200（保留已配对状态与别名）。响应含 `heartbeat_interval_ms`（默认 5000）与 `offline_timeout_ms`（默认 15000），设备应按此节奏心跳。

### 8.2 心跳

`POST /api/devices/:id/heartbeat`，请求头 `X-Device-Token`。

```json
{
  "battery_pct": null,
  "wifi": { "connected": true, "ssid": "SY-FIELD-A", "rssi_dbm": -52 },
  "hub_reachable": true,
  "cloud_reachable": false,
  "task_state": "recording",
  "storage_free_bytes": 31204147200,
  "state_version": 42,
  "last_seen": "2026-11-26T09:27:14.298Z"
}
```

- `state_version` 小于服务端已存版本的视为陈旧数据，不覆盖，响应 `accepted: false`
- 电量不可读时传 `null`，不要传 0
- 未注册设备直接心跳会自动建档为待配对

### 8.3 待方明确认

| 项 | 待确认内容 |
| --- | --- |
| device_id | 是否等于设备 SN |
| utc_est_ns | 时间来源与显示口径 |
| 命令回执 | 设备应答格式（如 `OK\r\n`）与拒绝原因枚举 |
| RTSP | 拉流地址、鉴权、编码参数（T10 用） |

---

## 9. 变更流程

1. **只增不改**：新增字段必须可选或有默认值；删除字段、改类型属破坏性变更
2. **契约先行**：先改 `types.ts`，再写实现，禁止代码先行
3. **五处同步**：`types.ts`、`schema.ts`、`mock.ts`、契约测试、本文档
4. **版本号**：加字段升次版本（v1.0 → v1.1）；破坏性变更升主版本并要求双方书面确认
5. **设备侧差异**：在管理服务接入层转换，不修改契约字段

### 版本记录

| 版本 | 日期 | 变更 | 对应任务 |
| --- | --- | --- | --- |
| v1.0 | 2026-11-26 | 首版：六对象、认证、设备、任务、会话、事件、指令、上传、WS | T02 / T04 / T05 / T07 |
| v1.1（预计） | T10 | 新增视频流对象、预览协商、WS 消息体 | T10 |
