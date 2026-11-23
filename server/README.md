# helmet-hub

抓鸡作业智能头盔 · 现场管理服务：数据库建模、访问层与 HTTP/WebSocket 接口。

- 契约来源：`sheyuan-ui/sheyuan-ui` @ `9ea16e1`，`src/contracts/`（六对象，snake_case）
- 运行时：Node.js ≥ 22.5，使用内置 `node:sqlite`（`DatabaseSync`），无原生编译依赖
- 数据库：单文件 SQLite，WAL + 外键 + busy_timeout
- 接口：`node:http` 自建路由 + `ws`，无 Web 框架
- 语言：TypeScript 仅使用可擦除语法（`erasableSyntaxOnly`），Node 直接运行 `.ts`

表结构与字段映射见 [docs/DATABASE.md](docs/DATABASE.md)；
接口、幂等、错误码与上传流程见 [docs/API.md](docs/API.md)。

## 目录

```
src/
  contracts/        T02 契约类型与 mock（上游只读复制）
  auth/             口令哈希、短期 JWT、认证服务（T04）
  db/
    open.ts         打开数据库与 PRAGMA
    migrate.ts      migrations/*.sql 迁移器（校验和、事务、幂等）
    transaction.ts  BEGIN IMMEDIATE / 嵌套 SAVEPOINT
    migrations/     0001_init.sql、0002_upload_chunk.sql、0003_auth.sql
    time.ts         UTC ISO 8601 规范化
  repos/            六对象 + 幂等键 + 审计 + 账号/刷新令牌的访问层
  server/
    create-server.ts  HTTP 服务、CORS、请求 ID、身份解析、统一响应
    router.ts         方法 + 路径模板匹配
    idempotency.ts    写接口幂等
    hub.ts            WebSocket 主题订阅与推送
    middleware/       三角色矩阵与拒绝访问审计
    handlers/         六对象、上传与认证接口
  seed/demo.ts      MOCK_CONTRACT 演示数据
  cli/              migrate / seed / serve / user 命令
tests/              node:test（仓储 + HTTP/WS 集成 + 认证）
data/               默认数据库与上传目录（不提交）
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run db` | 建库/迁移 + 写入演示数据 |
| `npm run migrate` | 只应用未执行的迁移 |
| `npm run seed` | 写入或重置演示数据 |
| `npm run serve` | 启动管理服务（默认 `0.0.0.0:8080`） |
| `npm run dev` | 监听 `src/` 变化自动重启 |
| `npm run user` | 账号维护：`create <用户名> <viewer\|operator\|admin>` / `list` |
| `npm test` | 运行仓储、HTTP/WS 集成与认证测试 |
| `npm run typecheck` | 类型检查 |

`node src/cli/migrate.ts <路径>` / `node src/cli/seed.ts <路径>` 可指定库文件；
环境变量 `HELMET_HUB_DB` 可覆盖默认路径 `data/helmet-hub.db`。

服务端环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | 监听端口与地址 |
| `HELMET_HUB_DB` | `data/helmet-hub.db` | 启动时自动迁移 |
| `HELMET_HUB_UPLOAD_DIR` | `data/uploads` | 分块落盘目录 |
| `HELMET_HUB_TOKEN` | 未设置 | 设置后 `/api` 与 `/ws` 需 Bearer 令牌；持令牌者按部署方 `admin` 记录审计 |
| `HELMET_HUB_AUTH` | 开启 | 设为 `off` 关闭三角色鉴权，回到免登录演示路径 |
| `HELMET_HUB_JWT_SECRET` | 随机生成 | 访问令牌签名密钥，至少 32 字符；不设则每次重启令牌全失效 |
| `HELMET_HUB_DEVICE_TOKEN` | 未设置 | 设置后设备注册与心跳接口（`/api/devices/register`、`/api/devices/:id/heartbeat`）必须携带 `X-Device-Token` |
| `HELMET_HUB_HEARTBEAT_INTERVAL_MS` | `5000` | 建议心跳间隔，随注册/心跳响应下发 |
| `HELMET_HUB_OFFLINE_TIMEOUT_MS` | `15000` | 超过该时长未心跳判离线 |

设备侧接入示例（与用户登录互不影响）：

```bash
curl -X POST http://127.0.0.1:8080/api/devices/register \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Token: <设备令牌>' \
  -d '{"device_id":"edge-01","model":"SY-Helmet Edge","firmware_version":"v1.4.2"}'

curl -X POST http://127.0.0.1:8080/api/devices/edge-01/heartbeat \
  -H 'Content-Type: application/json' \
  -H 'X-Device-Token: <设备令牌>' \
  -d '{"battery_pct":86,"wifi":{"connected":true,"ssid":"SY-FIELD-A","rssi_dbm":-52},"hub_reachable":true,"cloud_reachable":false,"task_state":"recording","storage_free_bytes":31204147200,"state_version":7}'
```

## 使用

```bash
npm run db
npm run user -- create admin admin      # 首次使用先建账号，随机口令只打印一次
npm run serve
curl http://127.0.0.1:8080/api/devices  # 开启鉴权后返回 401
```

登录拿令牌（`expires_in` 为访问令牌剩余秒数，到期用 `refresh_token` 换新）：

```bash
curl -X POST http://127.0.0.1:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<口令>"}'

curl http://127.0.0.1:8080/api/devices -H "Authorization: Bearer <access_token>"
```

角色矩阵：读取需 `viewer`，写入需 `operator`，审计流水 `/api/audit` 仅 `admin`；
越权与未登录请求都会写入 `audit_log`。细节见 [docs/API.md](docs/API.md) 第 9 节。

写入接口必须带 `Idempotency-Key`：

```bash
curl -X POST http://127.0.0.1:8080/api/jobs \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 8f0c1d2e' \
  -d '{"job_id":"job-demo","farm_id":"farm-01","house_id":"house-a3","scenario":"broiler","batch_id":"B-1","owner_name":"张伟","location":{"farm_id":"farm-01","farm_name":"一号场区","house_id":"house-a3","house_name":"A3 栋","geo":null},"attachment_ids":[]}'
```

仓储层可直接在服务内使用：

```ts
import { migrate, openDatabase } from "./src/db/index.ts";
import { createRepositories } from "./src/repos/index.ts";

const db = openDatabase({ file: "data/helmet-hub.db" });
migrate(db, "src/db/migrations");
const repos = createRepositories(db);

repos.devices.upsertStatus(deviceStatus);
repos.events.review(eventId, {
  conclusion: "confirmed",
  reviewer_id: "user-huangqx",
  reviewed_at: "2026-11-18T11:00:00Z",
  remark: null,
});
```

## 建模约定

1. **字段与契约一一对应**：库列全部 snake_case；嵌套对象展开为前缀列，读回时重组。
2. **主键**：TEXT。设备侧 ID 原样保存，服务端对象用 UUID，便于断网补录与云端合并。
3. **时间**：契约 UTC ISO 8601，入库规范成 `YYYY-MM-DDTHH:mm:ss.sssZ`；字符串排序即时间排序。
4. **未知值**：`NULL`，不用 0 或空串顶替（`battery_pct` 等）。
5. **枚举**：TEXT + `CHECK`；契约改枚举必须新增迁移，不改历史迁移。
6. **迁移不可变**：已执行文件内容变化会让 `migrate()` 直接报错。
7. **事务**：多表写入包在 `withTransaction()` 内；外层 `BEGIN IMMEDIATE`，嵌套自动 SAVEPOINT。
8. **乐观锁**：`DeviceStatus.state_version` 较小的上报丢弃；`Session.score.version` 回退抛 `StaleVersionError`。
9. **幂等**：写接口用 `idempotency.reserve/complete`，同键重放返回首次响应。
10. **证据不覆盖**：人工复核只写 `review_*` 与 `event_review_log`，AI 判定与旧评分版本保留。