import { useEffect, useMemo, useState } from "react";
import { keyframes, styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { useNotification } from "../../contexts/NotificationContext";
import type { Role } from "../../api";
import NewTaskForm, {
  type DeviceOption,
  type NewTaskInput,
} from "./NewTaskForm";
import AttachmentDialog, { type Attachment } from "./AttachmentPreview";

const SITES = ["1号场区", "2号场区", "3号场区"];

interface DeviceScore {
  score: number;
  delta: number;
  avg5: number;
  trend: number;
  evaluated: number;
  effective: number;
  coverage: number;
  recent: number[];
  rules: { name: string; max: number; got: number }[];
  stages: { name: string; count: number; deduct: number }[];
  versions: {
    name: string;
    label: string;
    score: number;
    coverage: number;
    desc: string;
    tag: "当前" | "历史";
  }[];
}

/** 每台设备独立的评分档案，按设备号取用 */
const DEVICE_SCORES: Record<string, DeviceScore> = {
  "01": {
    score: 92.0,
    delta: 2.0,
    avg5: 90.4,
    trend: 1.1,
    evaluated: 12,
    effective: 11,
    coverage: 88,
    recent: [82, 84, 83, 87, 86, 90, 89, 91, 90, 92],
    rules: [
      { name: "动作完整性", max: 30, got: 29 },
      { name: "动作顺序", max: 25, got: 24 },
      { name: "抓取成功率", max: 20, got: 19 },
      { name: "停留时长", max: 15, got: 11 },
      { name: "重复动作", max: 10, got: 9 },
    ],
    stages: [
      { name: "接近", count: 12, deduct: 1 },
      { name: "伸手", count: 12, deduct: 1 },
      { name: "抓取", count: 11, deduct: 2 },
      { name: "提起", count: 11, deduct: 1 },
      { name: "转移", count: 11, deduct: 2 },
      { name: "放置", count: 11, deduct: 1 },
    ],
    versions: [
      { name: "v2", label: "人工复核", score: 92.0, coverage: 88, desc: "今天 13:02 · 复核 3 条 · 张三", tag: "当前" },
      { name: "v1", label: "AI 原始", score: 89.4, coverage: 88, desc: "今天 12:47 · 规则 v1.3 · 模型 hand-pose-2d", tag: "历史" },
    ],
  },
  "02": {
    score: 88.5,
    delta: 1.2,
    avg5: 87.1,
    trend: 0.6,
    evaluated: 10,
    effective: 10,
    coverage: 85,
    recent: [80, 82, 81, 84, 83, 85, 84, 86, 86, 88.5],
    rules: [
      { name: "动作完整性", max: 30, got: 27.5 },
      { name: "动作顺序", max: 25, got: 22 },
      { name: "抓取成功率", max: 20, got: 18 },
      { name: "停留时长", max: 15, got: 13 },
      { name: "重复动作", max: 10, got: 8 },
    ],
    stages: [
      { name: "接近", count: 10, deduct: 1 },
      { name: "伸手", count: 10, deduct: 2 },
      { name: "抓取", count: 9, deduct: 2 },
      { name: "提起", count: 9, deduct: 1 },
      { name: "转移", count: 9, deduct: 2 },
      { name: "放置", count: 9, deduct: 1 },
    ],
    versions: [
      { name: "v2", label: "人工复核", score: 88.5, coverage: 85, desc: "今天 13:16 · 复核 2 条 · 张三", tag: "当前" },
      { name: "v1", label: "AI 原始", score: 86.9, coverage: 85, desc: "今天 12:51 · 规则 v1.3 · 模型 hand-pose-2d", tag: "历史" },
    ],
  },
  "03": {
    score: 90.0,
    delta: 0.7,
    avg5: 89.2,
    trend: 0.4,
    evaluated: 11,
    effective: 10,
    coverage: 87,
    recent: [84, 85, 86, 87, 86, 88, 89, 89, 90, 90],
    rules: [
      { name: "动作完整性", max: 30, got: 28 },
      { name: "动作顺序", max: 25, got: 23 },
      { name: "抓取成功率", max: 20, got: 18 },
      { name: "停留时长", max: 15, got: 12 },
      { name: "重复动作", max: 10, got: 9 },
    ],
    stages: [
      { name: "接近", count: 10, deduct: 1 },
      { name: "伸手", count: 10, deduct: 1 },
      { name: "抓取", count: 10, deduct: 2 },
      { name: "提起", count: 10, deduct: 1 },
      { name: "转移", count: 10, deduct: 2 },
      { name: "放置", count: 10, deduct: 1 },
    ],
    versions: [
      { name: "v2", label: "人工复核", score: 90.0, coverage: 87, desc: "今天 13:21 · 复核 1 条 · 张三", tag: "当前" },
      { name: "v1", label: "AI 原始", score: 88.6, coverage: 87, desc: "今天 12:58 · 规则 v1.3 · 模型 hand-pose-2d", tag: "历史" },
    ],
  },
  "04": {
    score: 85.0,
    delta: -0.5,
    avg5: 86.2,
    trend: -0.2,
    evaluated: 9,
    effective: 8,
    coverage: 82,
    recent: [88, 87, 86, 87, 86, 85, 86, 85, 85.5, 85],
    rules: [
      { name: "动作完整性", max: 30, got: 26 },
      { name: "动作顺序", max: 25, got: 21 },
      { name: "抓取成功率", max: 20, got: 17 },
      { name: "停留时长", max: 15, got: 12 },
      { name: "重复动作", max: 10, got: 9 },
    ],
    stages: [
      { name: "接近", count: 8, deduct: 1 },
      { name: "伸手", count: 8, deduct: 2 },
      { name: "抓取", count: 8, deduct: 3 },
      { name: "提起", count: 8, deduct: 1 },
      { name: "转移", count: 8, deduct: 2 },
      { name: "放置", count: 8, deduct: 1 },
    ],
    versions: [
      { name: "v2", label: "人工复核", score: 85.0, coverage: 82, desc: "今天 13:08 · 复核 1 条 · 张三", tag: "当前" },
      { name: "v1", label: "AI 原始", score: 85.6, coverage: 82, desc: "今天 12:55 · 规则 v1.3 · 模型 hand-pose-2d", tag: "历史" },
    ],
  },
};

interface CurrentTask {
  id: string;
  site: string;
  hall: string;
  scene: string;
  batch: string;
  operator: string;
  date: string;
  location: string;
  /** 全部运行中设备（含此前下发、本轮未勾选而继续运行的设备） */
  deviceIds: string[];
  /** 本次下发选中的设备；缺省视为全部 */
  dispatchIds?: string[];
  startAt: string;
  note: string;
  attachments: Attachment[];
}

/** 运行中的任务属于业务状态：刷新、切页、重新登录后都要还原 */
const TASK_STATE_KEY = "sheyuan.current-task";
/** 旧版本里写死的运行时长不应继续回放，版本不符时按全新任务开始 */
const TASK_STATE_VERSION = 2;

interface StoredTaskState {
  v: number;
  task: CurrentTask;
  names: Record<string, string>;
  joinedAt: Record<string, number>;
  offlineAt: Record<string, number>;
  elapsed: number;
  /** 最近一次下发时的 elapsed；任务计时从这一刻起算 */
  dispatchAt?: number;
  savedAt: number;
}

const loadTaskState = (): StoredTaskState | null => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TASK_STATE_KEY) ?? "null");
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      parsed.v !== TASK_STATE_VERSION ||
      !parsed.task ||
      !Array.isArray(parsed.task.deviceIds) ||
      typeof parsed.elapsed !== "number" ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    // 旧版本附件存的是文件名数组，统一成对象便于点击查看
    parsed.task.attachments = Array.isArray(parsed.task.attachments)
      ? parsed.task.attachments.map((a: unknown) =>
          typeof a === "string" ? { name: a } : a,
        )
      : [];
    return parsed as StoredTaskState;
  } catch {
    return null;
  }
};

interface HistoryTask {
  id: string;
  name: string;
  site: string;
  hall: string;
  batch: string;
  operator: string;
  date: string;
  deviceIds: string[];
  startAt: string;
  duration: string;
  score: number | null;
  coverage: number | null;
  status: string;
  attachments: string[];
}

/** 每台设备各自一条任务，任务名 = 下发时刻-设备号 */
const INITIAL_HISTORY: HistoryTask[] = [
  {
    id: "T-20261119-002-01",
    name: "20261119-0810-01",
    site: "2号场区",
    hall: "3号栋",
    batch: "B-1118",
    operator: "张三",
    date: "2026-11-19",
    deviceIds: ["头盔-01"],
    startAt: "11-19 08:10",
    duration: "00:42:15",
    score: 89.6,
    coverage: 88,
    status: "已完成",
    attachments: [],
  },
  {
    id: "T-20261119-002-02",
    name: "20261119-0810-02",
    site: "2号场区",
    hall: "3号栋",
    batch: "B-1118",
    operator: "李四",
    date: "2026-11-19",
    deviceIds: ["头盔-02"],
    startAt: "11-19 08:10",
    duration: "00:41:52",
    score: 87.5,
    coverage: 86,
    status: "已完成",
    attachments: [],
  },
  {
    id: "T-20261118-005-02",
    name: "20261118-1402-02",
    site: "2号场区",
    hall: "2号栋",
    batch: "B-1117",
    operator: "李四",
    date: "2026-11-18",
    deviceIds: ["头盔-02"],
    startAt: "11-18 14:02",
    duration: "00:36:40",
    score: 87.2,
    coverage: 85,
    status: "已完成",
    attachments: ["批次资料.pdf"],
  },
  {
    id: "T-20261118-003-01",
    name: "20261118-0844-01",
    site: "1号场区",
    hall: "1号栋",
    batch: "B-1116",
    operator: "张三",
    date: "2026-11-18",
    deviceIds: ["头盔-01"],
    startAt: "11-18 08:44",
    duration: "00:51:08",
    score: null,
    coverage: 61,
    status: "已完成",
    attachments: [],
  },
  {
    id: "T-20261117-004-04",
    name: "20261117-1520-04",
    site: "3号场区",
    hall: "4号栋",
    batch: "B-1115",
    operator: "王五",
    date: "2026-11-17",
    deviceIds: ["头盔-04"],
    startAt: "11-17 15:20",
    duration: "00:28:33",
    score: 84.5,
    coverage: 90,
    status: "已完成",
    attachments: [],
  },
  {
    id: "T-20261116-002-02",
    name: "20261116-0905-02",
    site: "2号场区",
    hall: "2号栋",
    batch: "B-1114",
    operator: "李四",
    date: "2026-11-16",
    deviceIds: ["头盔-02"],
    startAt: "11-16 09:05",
    duration: "00:47:12",
    score: 82.8,
    coverage: 86,
    status: "已完成",
    attachments: ["现场照片.jpg"],
  },
  {
    id: "T-20261116-002-04",
    name: "20261116-0905-04",
    site: "2号场区",
    hall: "2号栋",
    batch: "B-1114",
    operator: "王五",
    date: "2026-11-16",
    deviceIds: ["头盔-04"],
    startAt: "11-16 09:05",
    duration: "00:45:30",
    score: 80.7,
    coverage: 84,
    status: "已完成",
    attachments: ["现场照片.jpg"],
  },
];

type Evaluable = "可评估" | "低置信" | "遮挡";

interface ReviewEvent {
  id: string;
  time: string;
  device: string;
  action: string;
  conf: number;
  evaluable: Evaluable;
  rule: string;
  clip: string;
  ai: "违规" | "合规";
  aiReason: string;
  status: "待复核" | "已确认" | "已驳回" | "无法判定";
  reviewer: string;
  note: string;
  /** 事件所属任务；复核页按任务编号与批次分组，跨当前与历史任务 */
  taskId: string;
  taskName: string;
  batch: string;
  site: string;
  hall: string;
}

interface EventGroup {
  taskName: string;
  taskId: string;
  batch: string;
  site: string;
  hall: string;
  current: boolean;
  pending: number;
  reviewed: number;
  devices: string[];
  events: ReviewEvent[];
}

/** 逐条复核的人工结论；无法判定也算已复核 */
type Conclusion = "有效" | "无效" | "无法判定";

const conclusionOf = (status: ReviewEvent["status"]): Conclusion | null =>
  status === "已确认"
    ? "有效"
    : status === "已驳回"
      ? "无效"
      : status === "无法判定"
        ? "无法判定"
        : null;

const statusOf = (conclusion: Conclusion): ReviewEvent["status"] =>
  conclusion === "有效" ? "已确认" : conclusion === "无效" ? "已驳回" : "无法判定";

const INITIAL_EVENTS: ReviewEvent[] = [
  {
    id: "E-1042",
    time: "10:18:42",
    device: "头盔-01",
    action: "抓取",
    conf: 0.86,
    evaluable: "可评估",
    rule: "R-03 停留时长",
    clip: "00:02:14–00:02:41",
    ai: "违规",
    aiReason: "抓取后停留超过阈值 2.4s",
    status: "待复核",
    reviewer: "",
    note: "",
    taskId: "T-20261119-003",
    taskName: "20261119-0912-01",
    batch: "B-1118",
    site: "2号场区",
    hall: "3号栋",
  },
  {
    id: "E-1051",
    time: "10:21:07",
    device: "头盔-02",
    action: "转移",
    conf: 0.81,
    evaluable: "可评估",
    rule: "R-05 动作顺序",
    clip: "00:04:02–00:04:19",
    ai: "违规",
    aiReason: "转移前未完成提起动作",
    status: "待复核",
    reviewer: "",
    note: "",
    taskId: "T-20261119-003",
    taskName: "20261119-0912-02",
    batch: "B-1118",
    site: "2号场区",
    hall: "3号栋",
  },
  {
    id: "E-1063",
    time: "10:26:33",
    device: "头盔-01",
    action: "提起",
    conf: 0.42,
    evaluable: "低置信",
    rule: "R-05 动作顺序",
    clip: "00:08:45–00:09:03",
    ai: "合规",
    aiReason: "置信度不足，建议人工确认",
    status: "待复核",
    reviewer: "",
    note: "",
    taskId: "T-20261119-003",
    taskName: "20261119-0912-01",
    batch: "B-1118",
    site: "2号场区",
    hall: "3号栋",
  },
  {
    id: "E-1074",
    time: "10:31:12",
    device: "头盔-02",
    action: "放置",
    conf: 0.9,
    evaluable: "可评估",
    rule: "R-06 放置高度",
    clip: "00:12:20–00:12:38",
    ai: "合规",
    aiReason: "放置姿态符合规范",
    status: "已确认",
    reviewer: "张三",
    note: "画面清晰，与判定一致",
    taskId: "T-20261119-003",
    taskName: "20261119-0912-02",
    batch: "B-1118",
    site: "2号场区",
    hall: "3号栋",
  },
  {
    id: "E-1088",
    time: "10:35:48",
    device: "头盔-01",
    action: "抓取",
    conf: 0.88,
    evaluable: "可评估",
    rule: "R-02 抓取成功率",
    clip: "00:16:02–00:16:27",
    ai: "违规",
    aiReason: "抓取后出现二次回抓",
    status: "已驳回",
    reviewer: "李四",
    note: "实际为调整握姿，不构成重复抓取",
    taskId: "T-20261119-003",
    taskName: "20261119-0912-01",
    batch: "B-1118",
    site: "2号场区",
    hall: "3号栋",
  },
  {
    id: "E-0987",
    time: "08:22:10",
    device: "头盔-01",
    action: "抓取",
    conf: 0.79,
    evaluable: "可评估",
    rule: "R-03 停留时长",
    clip: "00:06:31–00:06:52",
    ai: "违规",
    aiReason: "抓取后停留超过阈值 2.1s",
    status: "待复核",
    reviewer: "",
    note: "",
    taskId: "T-20261119-002",
    taskName: "20261119-0810-01",
    batch: "B-1118",
    site: "2号场区",
    hall: "3号栋",
  },
  {
    id: "E-0992",
    time: "08:25:44",
    device: "头盔-02",
    action: "转移",
    conf: 0.84,
    evaluable: "可评估",
    rule: "R-05 动作顺序",
    clip: "00:09:10–00:09:32",
    ai: "违规",
    aiReason: "转移前未完成提起动作",
    status: "待复核",
    reviewer: "",
    note: "",
    taskId: "T-20261119-002",
    taskName: "20261119-0810-02",
    batch: "B-1118",
    site: "2号场区",
    hall: "3号栋",
  },
  {
    id: "E-0921",
    time: "14:18:03",
    device: "头盔-02",
    action: "放置",
    conf: 0.88,
    evaluable: "可评估",
    rule: "R-06 放置高度",
    clip: "00:11:08–00:11:26",
    ai: "合规",
    aiReason: "放置姿态符合规范",
    status: "待复核",
    reviewer: "",
    note: "",
    taskId: "T-20261118-005",
    taskName: "20261118-1402-02",
    batch: "B-1117",
    site: "2号场区",
    hall: "2号栋",
  },
  {
    id: "E-0875",
    time: "09:02:37",
    device: "头盔-01",
    action: "抓取",
    conf: 0.35,
    evaluable: "低置信",
    rule: "R-02 抓取成功率",
    clip: "00:05:12–00:05:38",
    ai: "合规",
    aiReason: "置信度不足，建议人工确认",
    status: "待复核",
    reviewer: "",
    note: "",
    taskId: "T-20261118-003",
    taskName: "20261118-0844-01",
    batch: "B-1116",
    site: "1号场区",
    hall: "1号栋",
  },
  {
    id: "E-0810",
    time: "15:44:19",
    device: "头盔-04",
    action: "放置",
    conf: 0.91,
    evaluable: "可评估",
    rule: "R-06 放置高度",
    clip: "00:10:20–00:10:41",
    ai: "合规",
    aiReason: "放置姿态符合规范",
    status: "已确认",
    reviewer: "王五",
    note: "画面清晰，与判定一致",
    taskId: "T-20261117-004",
    taskName: "20261117-1520-04",
    batch: "B-1115",
    site: "3号场区",
    hall: "4号栋",
  },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

const ymd = (at: Date) => `${at.getFullYear()}${pad2(at.getMonth() + 1)}${pad2(at.getDate())}`;

/** 下发时刻 → 任务编号（按天流水） */
const dispatchedTaskId = (prevId: string, at = new Date()) => {
  const day = ymd(at);
  const [, prevDay, prevSeq] = prevId.split("-");
  const seq = prevDay === day ? Number(prevSeq) + 1 : 1;
  return `T-${day}-${String(seq).padStart(3, "0")}`;
};

const clock = (at = new Date()) => `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;

/** 首次打开时的空任务：没有下发设备就不存在运行任务 */
const createInitialTask = (at: Date): CurrentTask => ({
  id: `T-${ymd(at)}-001`,
  site: "2号场区",
  hall: "3号栋",
  scene: "肉鸡",
  batch: "B-1118",
  operator: "张三",
  date: `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`,
  location: "31.2304, 121.4737",
  deviceIds: [],
  startAt: clock(at),
  note: "",
  attachments: [{ name: "批次资料.pdf" }, { name: "作业单.xlsx" }],
});

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

interface SessionRow {
  device: string;
  taskName: string;
  operator: string;
  status: string;
  score: number | null;
  grabs: number;
  valid: number;
  coverage: number | null;
  recorded: number;
}

const deviceNo = (id: string) => id.split("-").pop() ?? id;

const scoreFor = (id: string) => DEVICE_SCORES[deviceNo(id)] ?? DEVICE_SCORES["01"];

const durationToSeconds = (text: string) => {
  const [h, m, s] = text.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

function buildSessions(
  deviceIds: string[],
  taskNames: Record<string, string>,
  recorded: Record<string, number>,
  operator: string,
): SessionRow[] {
  return deviceIds.map((id, i) => {
    const profile = scoreFor(id);
    return {
      device: id,
      taskName: taskNames[id] ?? id,
      operator,
      status: "运行中",
      score: profile.score,
      grabs: Math.max(7 - i * 2, 1),
      valid: Math.max(6 - i, 1),
      coverage: profile.coverage,
      recorded: recorded[id] ?? 0,
    };
  });
}

function buildHistorySessions(task: HistoryTask): SessionRow[] {
  return task.deviceIds.map((id, i) => ({
    device: id,
    taskName: task.name,
    operator: task.operator,
    status: task.status,
    score: task.score === null ? null : Math.max(task.score - i * 2.1, 0),
    grabs: Math.max(6 - i, 1),
    valid: task.score === null ? 0 : Math.max(5 - i, 1),
    coverage: task.score === null ? null : Math.max((task.coverage ?? 0) - i * 2, 0),
    recorded: durationToSeconds(task.duration),
  }));
}

function exportCsv(task: HistoryTask) {
  const rows = [
    ["任务编号", "任务名称", "场区", "栋舍", "批次", "负责人", "作业日期", "参与设备", "开始时间", "时长", "评分", "覆盖率", "状态"],
    [
      task.id,
      task.name,
      task.site,
      task.hall,
      task.batch,
      task.operator,
      task.date,
      task.deviceIds.join("、"),
      task.startAt,
      task.duration,
      task.score === null ? "--" : task.score.toFixed(1),
      task.coverage === null ? "--" : `${task.coverage}%`,
      task.status,
    ],
  ];
  const csv =
    "\uFEFF" +
    rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `任务摘要-${task.id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const RING_R = 32;
const RING_LEN = 1.5 * Math.PI * RING_R;
const RING_PATH = "M 17.37 62.63 A 32 32 0 1 1 62.63 62.63";

const pulse = keyframes`
  0%, 100% { opacity: 1; box-shadow: 0 0 6px ${HUD.ok}; }
  50% { opacity: 0.55; box-shadow: 0 0 2px ${HUD.ok}; }
`;

type TaskTab = "current" | "new" | "review" | "history";

const TABS: { key: TaskTab; label: string }[] = [
  { key: "current", label: "当前任务" },
  { key: "new", label: "新建任务" },
  { key: "review", label: "事件复核" },
  { key: "history", label: "历史任务" },
];

const Page = styled("div")<{ $hidden: boolean }>(({ $hidden }) => ({
  display: $hidden ? "none" : "flex",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  backgroundColor: HUD.deep,
  "@media (max-width: 760px)": { flexDirection: "column" },
}));

/** 左侧导航：当前任务 / 新建任务 / 事件复核 / 历史任务 */
const Sidebar = styled("nav")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: 3,
  width: 196,
  flexShrink: 0,
  minHeight: 0,
  padding: "18px 12px",
  backgroundColor: "#050b16",
  borderRight: `1px solid ${theme.palette.divider}`,
  overflowY: "auto",
  "@media (max-width: 1000px)": { width: 160, padding: "16px 8px" },
  "@media (max-width: 760px)": {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: "100%",
    height: 48,
    padding: "0 12px",
    borderRight: "none",
    borderBottom: `1px solid ${theme.palette.divider}`,
    overflowX: "auto",
    overflowY: "hidden",
  },
}));

const SideHead = styled("div")({
  padding: "0 10px 16px",
  "& > h1": {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: 0.8,
    color: HUD.text,
  },
  "& > span": {
    display: "block",
    marginTop: 3,
    fontSize: 10,
    letterSpacing: 0.4,
    color: HUD.textDim,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  "@media (max-width: 760px)": { display: "none" },
});

const NavItem = styled("button")<{ $active: boolean }>(({ $active }) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  height: 34,
  padding: "0 10px",
  borderRadius: 5,
  border: "none",
  background: $active ? "rgba(63, 178, 255, 0.08)" : "transparent",
  boxShadow: $active ? `inset 2px 0 0 ${HUD.cyan}` : "none",
  color: $active ? HUD.text : HUD.textDim,
  fontSize: 12.5,
  fontWeight: $active ? 600 : 400,
  letterSpacing: 0.4,
  textAlign: "left",
  whiteSpace: "nowrap",
  cursor: "pointer",
  transition: "background-color 160ms ease, color 160ms ease",
  "&:hover": {
    backgroundColor: $active ? "rgba(63, 178, 255, 0.12)" : "rgba(255, 255, 255, 0.04)",
    color: HUD.text,
  },
  "@media (max-width: 760px)": {
    width: "auto",
    height: 30,
    padding: "0 10px",
    flexShrink: 0,
    borderRadius: 5,
    boxShadow: $active ? `inset 0 -2px 0 ${HUD.cyan}` : "none",
  },
}));

const NavRunDot = styled("i")<{ $running: boolean }>(({ $running }) => ({
  width: 5,
  height: 5,
  borderRadius: "50%",
  backgroundColor: $running ? HUD.ok : HUD.danger,
  animation: $running ? `${pulse} 1.6s ease-in-out infinite` : "none",
  boxShadow: $running ? "none" : `0 0 6px ${HUD.danger}`,
}));

const NavBadge = styled("span")<{ $warn?: boolean }>(({ $warn }) => ({
  marginLeft: "auto",
  padding: "0 6px",
  borderRadius: 8,
  backgroundColor: $warn ? "rgba(242, 163, 60, 0.14)" : "rgba(126, 162, 205, 0.12)",
  fontSize: 10,
  lineHeight: "16px",
  color: $warn ? HUD.gold : HUD.textDim,
  fontVariantNumeric: "tabular-nums",
}));

const Content = styled("div")({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  padding: "18px 22px 28px",
  "@media (max-width: 760px)": { padding: "14px 14px 22px" },
});

const ContentInner = styled("div")({
  width: "100%",
  maxWidth: 1280,
  display: "flex",
  flexDirection: "column",
  gap: 14,
});

const SectionHead = styled("div")({
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  flexWrap: "wrap",
});

const SectionTitle = styled("h2")({
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: 0.6,
  color: HUD.text,
});

const SectionHint = styled("span")({
  marginLeft: "auto",
  fontSize: 11,
  letterSpacing: 0.2,
  color: HUD.textDim,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const HeadActions = styled("div")({
  display: "flex",
  gap: 6,
  flexShrink: 0,
});

const Card = styled("section")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
}));

const CardHead = styled("div")({
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "13px 16px 0",
  "@media (max-width: 760px)": {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
  },
});

const CardTitle = styled("h3")({
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.6,
  color: HUD.textDim,
});

/** 复核列表：每个任务一行，默认收起，点击任务行展开事件清单 */
const GroupHeadRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 16px",
  transition: "background-color 160ms ease",
  "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.025)" },
});

const GroupToggle = styled("button")({
  display: "flex",
  alignItems: "center",
  gap: 10,
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
  "&:focus-visible": { outline: `1px solid ${HUD.cyan}66`, outlineOffset: 2 },
});

const Caret = styled("span")<{ $open: boolean }>(({ $open }) => ({
  flexShrink: 0,
  fontSize: 10,
  lineHeight: 1,
  color: $open ? HUD.cyan : HUD.textDim,
  transform: $open ? "rotate(90deg)" : "none",
  transition: "transform 160ms ease, color 160ms ease",
}));

const GroupHeadMain = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
});

const GroupTitleRow = styled("div")({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  minWidth: 0,
});

const GroupName = styled("span")({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  color: HUD.text,
});

const GroupMeta = styled("span")({
  fontSize: 11,
  letterSpacing: 0.2,
  color: HUD.textDim,
});

const HeadHint = styled("span")({
  marginLeft: "auto",
  fontSize: 11,
  letterSpacing: 0.2,
  color: HUD.textDim,
  opacity: 0.85,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  "@media (max-width: 760px)": {
    marginLeft: 0,
    whiteSpace: "normal",
    lineHeight: 1.55,
  },
});

const CardBody = styled("div")({
  padding: "12px 16px 16px",
  minWidth: 0,
});

/** 状态标签 */
const TONES = {
  ok: HUD.ok,
  gold: HUD.gold,
  danger: HUD.danger,
  cyan: HUD.cyan,
  dim: HUD.textDim,
} as const;

type Tone = keyof typeof TONES;

const Tag = styled("span")<{ $tone: Tone }>(({ $tone }) => {
  const color = TONES[$tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "0 7px",
    borderRadius: 5,
    border: `1px solid ${color}40`,
    backgroundColor: `${color}0f`,
    color,
    fontSize: 10,
    lineHeight: "16px",
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
    flexShrink: 0,
  };
});

/** 当前任务 */
const TaskTop = styled("div")({
  display: "flex",
  alignItems: "flex-start",
  flexWrap: "wrap",
  gap: 16,
  paddingBottom: 12,
});

const TaskNameRow = styled("div")({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
});

const TaskName = styled("div")({
  fontSize: 17,
  fontWeight: 600,
  letterSpacing: 0.3,
  color: HUD.text,
});

const RunChip = styled("span")({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 8px",
  borderRadius: 5,
  border: `1px solid ${HUD.ok}40`,
  backgroundColor: `${HUD.ok}0f`,
  color: HUD.ok,
  fontSize: 10,
  lineHeight: "17px",
  letterSpacing: 0.4,
  flexShrink: 0,
  whiteSpace: "nowrap",
});

const RunDot = styled("i")({
  width: 5,
  height: 5,
  borderRadius: "50%",
  backgroundColor: HUD.ok,
  animation: `${pulse} 1.6s ease-in-out infinite`,
});

const TaskId = styled("div")({
  marginTop: 4,
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 11,
  letterSpacing: 0.5,
  color: HUD.textDim,
});

const TimerBlock = styled("div")({
  marginLeft: "auto",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 3,
  "& > span": { fontSize: 10, letterSpacing: 0.6, color: HUD.textDim },
  "& > b": {
    fontFamily: '"Roboto Mono", "Consolas", monospace',
    fontSize: 26,
    lineHeight: 1,
    fontWeight: 600,
    letterSpacing: 1,
    color: HUD.text,
    fontVariantNumeric: "tabular-nums",
  },
});

const MetaGrid = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "10px 18px",
  paddingTop: 12,
  borderTop: `1px solid ${theme.palette.divider}`,
}));

const Meta = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
  "& > span": { fontSize: 10, letterSpacing: 1, color: HUD.textDim },
  "& > b": {
    fontSize: 13,
    fontWeight: 500,
    color: HUD.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const NoteLine = styled("div")({
  display: "flex",
  flexWrap: "wrap",
  gap: "4px 18px",
  marginTop: 10,
  fontSize: 12,
  color: HUD.textDim,
});

/** 当前任务里的附件名，点击打开预览 */
const AttachLink = styled("button")({
  padding: 0,
  border: "none",
  background: "none",
  font: "inherit",
  color: HUD.text,
  textDecoration: "underline",
  textDecorationColor: HUD.line,
  textUnderlineOffset: 2,
  cursor: "pointer",
  transition: "color 140ms ease",
  "&:hover": { color: HUD.cyan, textDecorationColor: HUD.cyan },
});

/** 评分概览 + 评分标准两栏 */
const TwoCol = styled("div")({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
  gap: 14,
  alignItems: "stretch",
  "@media (max-width: 1000px)": { gridTemplateColumns: "minmax(0, 1fr)" },
});

const ScoreWrap = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 20,
  flexWrap: "wrap",
});

const GaugeWrap = styled("div")({
  position: "relative",
  width: 92,
  height: 92,
  flexShrink: 0,
});

const GaugeGlow = styled("div")({
  position: "absolute",
  inset: 8,
  borderRadius: "50%",
  background: `radial-gradient(circle at 50% 46%, ${HUD.ok}2e 0%, ${HUD.ok}10 52%, ${HUD.ok}00 74%)`,
  pointerEvents: "none",
});

const GaugeSvg = styled("svg")({
  width: "100%",
  height: "100%",
  display: "block",
  overflow: "visible",
});

const GaugeText = styled("div")({
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  pointerEvents: "none",
  "& > b": {
    fontFamily: '"Roboto Mono", "Consolas", monospace',
    fontSize: 26,
    lineHeight: 1,
    fontWeight: 600,
    letterSpacing: -0.5,
    color: HUD.text,
    fontVariantNumeric: "tabular-nums",
    textShadow: `0 0 12px ${HUD.ok}55`,
  },
  "& > span": { fontSize: 9, letterSpacing: 1.5, color: HUD.textDim },
});

const SideStats = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 7,
  minWidth: 148,
});

const Delta = styled("div")<{ $down?: boolean }>(({ theme, $down }) => ({
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  paddingBottom: 7,
  borderBottom: `1px solid ${theme.palette.divider}`,
  "& > b": {
    fontFamily: '"Roboto Mono", "Consolas", monospace',
    fontSize: 20,
    lineHeight: 1,
    fontWeight: 600,
    color: $down ? HUD.gold : HUD.ok,
    fontVariantNumeric: "tabular-nums",
  },
  "& > span": { fontSize: 11, letterSpacing: 0.5, color: HUD.textDim },
}));

const StatLine = styled("div")({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  "& > span": { fontSize: 11, letterSpacing: 0.5, color: HUD.textDim, whiteSpace: "nowrap" },
  "& > b": {
    fontFamily: '"Roboto Mono", "Consolas", monospace',
    fontSize: 13,
    fontWeight: 600,
    color: HUD.text,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
});

const CountLine = styled("div")({
  marginTop: "auto",
  paddingTop: 6,
  fontSize: 11,
  letterSpacing: 0.5,
  color: HUD.textDim,
});

const Spark = styled("div")({
  flex: 1,
  minWidth: 210,
  display: "flex",
  flexDirection: "column",
  gap: 5,
  "& svg": { display: "block", width: "100%", height: 66 },
  "& > span": { fontSize: 10, letterSpacing: 1, color: HUD.textDim, textAlign: "right" },
});

/** 评分依据与评分标准 */
const MetricsRow = styled("div")({
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 12,
});

const RuleList = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 11,
});

const RuleRow = styled("div")({
  display: "grid",
  gridTemplateColumns: "84px minmax(0, 1fr) 58px",
  alignItems: "center",
  gap: 12,
});

const RuleName = styled("span")({
  fontSize: 12,
  color: HUD.text,
  whiteSpace: "nowrap",
});

const RuleTrack = styled("div")({
  height: 5,
  borderRadius: 3,
  backgroundColor: "rgba(126, 162, 205, 0.16)",
  overflow: "hidden",
});

const RuleFill = styled("div")<{ $pct: number; $color: string }>(({ $pct, $color }) => ({
  width: `${Math.min(Math.max($pct, 0), 100)}%`,
  height: "100%",
  borderRadius: 3,
  background: `linear-gradient(90deg, ${$color}88, ${$color})`,
  boxShadow: `0 0 6px ${$color}55`,
}));

const RuleValue = styled("span")({
  justifySelf: "end",
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 12,
  fontWeight: 600,
  color: HUD.text,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  "& > i": {
    fontStyle: "normal",
    fontWeight: 400,
    fontSize: 10,
    color: HUD.textDim,
  },
});

/** 评分版本 */
const VersionList = styled("div")({
  display: "flex",
  flexDirection: "column",
});

const VersionRow = styled("div")<{ $current: boolean }>(({ theme, $current }) => ({
  display: "grid",
  gridTemplateColumns: "40px 84px 56px 72px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  padding: "8px 10px",
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: $current ? "rgba(63, 178, 255, 0.04)" : "transparent",
  fontSize: 12,
  color: HUD.text,
  "&:last-of-type": { borderBottom: "none" },
  "@media (max-width: 700px)": { gridTemplateColumns: "40px 84px 56px auto", "& > span:nth-of-type(4), & > span:nth-of-type(5)": { display: "none" } },
}));

const VersionName = styled("span")({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 12,
  fontWeight: 600,
  color: HUD.cyan,
});

const VersionScore = styled("span")({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 13,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: HUD.text,
});

const VersionDesc = styled("span")({
  fontSize: 11,
  color: HUD.textDim,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** 扣分图：六个动作阶段的扣分柱 */
const StageChart = styled("div")({
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 12,
  alignItems: "end",
});

const StageCol = styled("div")({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
});

const StageDeduct = styled("span")({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 12,
  fontWeight: 600,
  color: HUD.orange,
  fontVariantNumeric: "tabular-nums",
});

const BarArea = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  width: "100%",
  height: 78,
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const Bar = styled("div")<{ $pct: number }>(({ $pct }) => ({
  width: "56%",
  maxWidth: 56,
  height: `${Math.max($pct, 4)}%`,
  borderRadius: "3px 3px 0 0",
  background: "linear-gradient(180deg, rgba(239, 131, 58, 0.85), rgba(239, 131, 58, 0.22))",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.18)",
  transition: "height 320ms ease",
}));

const StageName = styled("span")({
  fontSize: 12,
  letterSpacing: 1,
  color: HUD.text,
});

const StageCount = styled("span")({
  fontSize: 10,
  color: HUD.textDim,
});

/** 展开后的事件清单 */
const EventList = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  borderTop: `1px solid ${theme.palette.divider}`,
}));

const EventRow = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: 5,
  padding: "10px 16px 10px 44px",
  borderBottom: `1px solid ${theme.palette.divider}`,
  "&:last-of-type": { borderBottom: "none" },
  "@media (max-width: 640px)": { paddingLeft: 24 },
}));

const EventHead = styled("div")({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
});

const EventTime = styled("span")({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 12,
  color: HUD.textDim,
  fontVariantNumeric: "tabular-nums",
});

const EventDevice = styled("span")({
  fontSize: 12,
  color: HUD.text,
});

const EventTitle = styled("span")({
  fontSize: 13,
  fontWeight: 600,
  color: HUD.text,
});

const EventMeta = styled("div")({
  fontSize: 11,
  letterSpacing: 0.2,
  color: HUD.textDim,
});

const SmallBtn = styled("button")<{ $primary?: boolean; $danger?: boolean }>(
  ({ $primary, $danger }) => {
    const color = $danger ? HUD.danger : $primary ? HUD.cyan : HUD.textDim;
    return {
      height: 30,
      padding: "0 13px",
      borderRadius: 5,
      border: `1px solid ${$primary || $danger ? `${color}66` : HUD.lineSoft}`,
      background: $primary ? "rgba(63, 178, 255, 0.10)" : $danger ? "rgba(245, 73, 102, 0.10)" : "transparent",
      color,
      fontSize: 12,
      letterSpacing: 0.3,
      cursor: "pointer",
      whiteSpace: "nowrap",
      transition: "background-color 160ms ease, color 160ms ease, border-color 160ms ease",
      "&:hover": {
        color: $danger ? "#fff" : HUD.text,
        backgroundColor: $danger ? "rgba(245, 73, 102, 0.24)" : "rgba(63, 178, 255, 0.16)",
      },
      "&:disabled": { opacity: 0.5, cursor: "default" },
    };
  },
);

/** 分组卡片上的“逐条复核”文字入口 */
const ReviewLink = styled("button")({
  padding: 0,
  border: "none",
  background: "transparent",
  color: HUD.cyan,
  fontSize: 11.5,
  letterSpacing: 0.2,
  cursor: "pointer",
  whiteSpace: "nowrap",
  "&:hover": { textDecoration: "underline" },
});

/** 任务详情与复核：左时间线 + 片段回放，右侧复核与评分 */
const ReviewGrid = styled("div")({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 0.95fr)",
  gap: 12,
  alignItems: "start",
  "@media (max-width: 980px)": { gridTemplateColumns: "1fr" },
});

const ReviewCol = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 0,
});

const TimelineBody = styled("div")({
  display: "flex",
  flexDirection: "column",
  margin: "10px 16px 14px",
  borderLeft: `1px solid ${HUD.lineSoft}`,
});

const TimelineItem = styled("button")<{ $active: boolean }>(({ $active }) => ({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "9px 12px 9px 16px",
  border: "none",
  background: $active ? "rgba(63, 178, 255, 0.08)" : "transparent",
  textAlign: "left",
  font: "inherit",
  cursor: "pointer",
  transition: "background-color 160ms ease",
  "&::before": {
    content: '""',
    position: "absolute",
    left: -4,
    top: 15,
    width: 7,
    height: 7,
    borderRadius: "50%",
    border: `1px solid ${$active ? HUD.cyan : HUD.line}`,
    backgroundColor: $active ? HUD.cyan : "#04090f",
  },
  "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
}));

const TimelineTitle = styled("b")({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: 0.2,
  color: HUD.text,
  fontVariantNumeric: "tabular-nums",
});

const TimelineMeta = styled("span")({
  fontSize: 11,
  letterSpacing: 0.2,
  color: HUD.textDim,
});

const ClipStage = styled("div")({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 260,
  padding: "0 20px",
  borderRadius: 6,
  border: `1px dashed ${HUD.line}`,
  background:
    "repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0 10px, transparent 10px 20px)",
  color: HUD.textDim,
  fontSize: 11.5,
  letterSpacing: 0.3,
  textAlign: "center",
});

const ClipTag = styled("span")({
  position: "absolute",
  left: 10,
  top: 10,
  padding: "0 8px",
  borderRadius: 4,
  border: `1px solid ${HUD.lineSoft}`,
  backgroundColor: "rgba(4, 9, 15, 0.7)",
  color: HUD.text,
  fontSize: 10.5,
  letterSpacing: 0.3,
});

const ReviewRows = styled("div")({
  padding: "12px 16px 0",
});

const ReviewRow = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "92px minmax(0, 1fr)",
  border: `1px solid ${theme.palette.divider}`,
  borderBottom: "none",
  "&:last-of-type": { borderBottom: `1px solid ${theme.palette.divider}` },
}));

const ReviewLabel = styled("div")(({ theme }) => ({
  padding: "11px 12px",
  borderRight: `1px solid ${theme.palette.divider}`,
  backgroundColor: "rgba(255, 255, 255, 0.02)",
  fontSize: 11.5,
  letterSpacing: 0.3,
  color: HUD.textDim,
}));

const ReviewValue = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 14px",
  minWidth: 0,
  "& > b": { fontSize: 12.5, fontWeight: 600, color: HUD.text },
});

const ReviewSub = styled("span")({
  fontSize: 11,
  letterSpacing: 0.2,
  color: HUD.textDim,
});

const ConclusionGroup = styled("div")({
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
});

const ConclusionBtn = styled("button")<{ $active: boolean; $tone: "ok" | "danger" | "gold" }>(
  ({ $active, $tone }) => {
    const color = TONES[$tone];
    return {
      height: 28,
      padding: "0 14px",
      borderRadius: 5,
      border: `1px solid ${$active ? color : HUD.lineSoft}`,
      background: $active ? `${color}1f` : "transparent",
      color: $active ? color : HUD.textDim,
      fontSize: 12,
      letterSpacing: 0.3,
      cursor: "pointer",
      "&:hover": { color, borderColor: `${color}88` },
      "&:disabled": { opacity: 0.5, cursor: "default" },
    };
  },
);

const NoteArea = styled("textarea")({
  width: "100%",
  minHeight: 64,
  resize: "vertical",
  padding: "8px 10px",
  borderRadius: 5,
  border: `1px solid ${HUD.lineSoft}`,
  background: "rgba(4, 9, 15, 0.6)",
  color: HUD.text,
  fontSize: 12,
  fontFamily: "inherit",
  lineHeight: 1.6,
  outline: "none",
  "&:focus": { borderColor: HUD.lineStrong, backgroundColor: "rgba(4, 9, 15, 0.85)" },
  "&::placeholder": { color: HUD.textDim },
});

const SaveRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "12px 16px 16px",
});

const SaveHint = styled("span")({
  fontSize: 10.5,
  letterSpacing: 0.2,
  color: HUD.textDim,
});

const EmptyNote = styled("div")({
  padding: "20px 16px",
  fontSize: 12,
  color: HUD.textDim,
});

/** 表格（会话 / 历史共用） */
const TableWrap = styled("div")({
  overflowX: "auto",
});

const Table = styled("table")(({ theme }) => ({
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  "& th": {
    padding: "4px 10px 8px",
    textAlign: "left",
    fontWeight: 500,
    fontSize: 10.5,
    letterSpacing: 0.5,
    color: HUD.textDim,
    borderBottom: `1px solid ${theme.palette.divider}`,
    whiteSpace: "nowrap",
  },
  "& td": {
    padding: "9px 10px",
    fontSize: 12.5,
    color: HUD.text,
    borderBottom: `1px solid ${theme.palette.divider}`,
    whiteSpace: "nowrap",
  },
  "& tbody tr:last-of-type td": { borderBottom: "none" },
  "& tbody tr:hover td": { backgroundColor: "rgba(63, 178, 255, 0.035)" },
  "@media (max-width: 760px)": {
    "& th, & td": { paddingLeft: 7, paddingRight: 7 },
    "& .col-sm-hide": { display: "none" },
  },
}));

const MonoCell = styled("span")({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  color: HUD.textDim,
});

const ScoreCell = styled("span")<{ $none?: boolean }>(({ $none }) => ({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 13,
  fontWeight: 600,
  color: $none ? HUD.textDim : HUD.text,
  fontVariantNumeric: "tabular-nums",
}));

const PendingCell = styled("span")<{ $warn: boolean }>(({ $warn }) => ({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 13,
  fontWeight: $warn ? 600 : 400,
  color: $warn ? HUD.gold : HUD.textDim,
  fontVariantNumeric: "tabular-nums",
}));

/** 历史筛选 */
const FilterBar = styled("div")({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
});

const FilterSelect = styled("select")({
  height: 30,
  padding: "0 8px",
  borderRadius: 4,
  border: `1px solid ${HUD.line}`,
  background: "rgba(4, 9, 15, 0.8)",
  color: HUD.text,
  fontSize: 12,
  outline: "none",
  "&:focus": { borderColor: HUD.lineStrong },
});

const FilterInput = styled("input")({
  height: 30,
  width: 130,
  padding: "0 10px",
  borderRadius: 4,
  border: `1px solid ${HUD.line}`,
  background: "rgba(4, 9, 15, 0.8)",
  color: HUD.text,
  fontSize: 12,
  outline: "none",
  "&:focus": { borderColor: HUD.lineStrong },
  "&::placeholder": { color: HUD.textDim },
});

const DeviceCell = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  "& > span:last-of-type": {
    fontFamily: '"Roboto Mono", "Consolas", monospace',
    fontSize: 10,
    letterSpacing: 0.5,
    color: HUD.textDim,
  },
});

/** 可选中的会话行：选中后高亮，下方评分随之切换 */
const SessionTr = styled("tr")<{ $clickable: boolean; $active: boolean }>(
  ({ $clickable, $active }) => ({
    cursor: $clickable ? "pointer" : "default",
    ...($active
      ? {
          "& td": { backgroundColor: "rgba(63, 178, 255, 0.06)" },
          "& td:first-of-type": { boxShadow: `inset 2px 0 0 ${HUD.cyan}` },
        }
      : {}),
  }),
);

function SessionTable({
  rows,
  pending,
  selected,
  onSelect,
}: {
  rows: SessionRow[];
  pending?: Record<string, number>;
  selected?: string | null;
  onSelect?: (device: string) => void;
}) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <th>设备</th>
            <th>操作员</th>
            <th>状态</th>
            <th>评分</th>
            <th>抓取事件</th>
            <th>有效事件</th>
            <th className="col-sm-hide">覆盖率</th>
            {pending ? <th>待复核</th> : null}
            <th className="col-sm-hide">录制时长</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <SessionTr
              key={r.device}
              $clickable={Boolean(onSelect)}
              $active={Boolean(onSelect) && selected === r.device}
              onClick={onSelect ? () => onSelect(r.device) : undefined}
            >
              <td>
                <DeviceCell>
                  <span>{r.device}</span>
                  <span>{r.taskName}</span>
                </DeviceCell>
              </td>
              <td>{r.operator}</td>
              <td><Tag $tone="ok">{r.status}</Tag></td>
              <td>
                <ScoreCell $none={r.score === null}>
                  {r.score === null ? "--" : r.score.toFixed(1)}
                </ScoreCell>
              </td>
              <td><MonoCell>{r.grabs}</MonoCell></td>
              <td><MonoCell>{r.valid}</MonoCell></td>
              <td className="col-sm-hide">
                <MonoCell>{r.coverage === null ? "--" : `${r.coverage}%`}</MonoCell>
              </td>
              {pending ? (
                <td>
                  <PendingCell $warn={(pending[r.device] ?? 0) > 0}>{pending[r.device] ?? 0}</PendingCell>
                </td>
              ) : null}
              <td className="col-sm-hide">
                <MonoCell>{formatDuration(r.recorded)}</MonoCell>
              </td>
            </SessionTr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

interface TaskInfoPageProps {
  hidden?: boolean;
  /** 当前登录角色：viewer 只读，operator 可下发/复核，admin 另有顶部「设置」页 */
  role: Role;
  /** 全局设备注册表；配对页连接成功后这里同步更新 */
  devices: DeviceOption[];
  /** 自增信号：变化时切到新建任务 */
  newTaskSignal?: number;
}

export default function TaskInfoPage({
  hidden = false,
  role,
  devices,
  newTaskSignal,
}: TaskInfoPageProps) {
  const { notify } = useNotification();
  const canOperate = role !== "viewer";
  /** 已配对设备集合：运行任务只能挂在已配对设备上，未配对的存档任务视为失效 */
  const pairedIds = useMemo(
    () => new Set(devices.filter((d) => d.paired).map((d) => d.id)),
    [devices],
  );
  const [boot] = useState(() => {
    const stored = loadTaskState();
    if (!stored) return null;
    const ids = stored.task.deviceIds.filter((id) => pairedIds.has(id));
    if (ids.length === 0) return null;
    const dispatchIds = (stored.task.dispatchIds ?? ids).filter((id) => ids.includes(id));
    return {
      ...stored,
      task: {
        ...stored.task,
        deviceIds: ids,
        dispatchIds: dispatchIds.length > 0 ? dispatchIds : ids,
      },
    };
  });
  /** 本次打开页面的时刻；没有历史任务时用它生成新的任务编号与任务名 */
  const [startedAt] = useState(() => new Date());
  const [tab, setTab] = useState<TaskTab>("current");
  const [task, setTask] = useState<CurrentTask>(() => boot?.task ?? createInitialTask(startedAt));
  const [history] = useState<HistoryTask[]>(INITIAL_HISTORY);
  const [events, setEvents] = useState<ReviewEvent[]>(INITIAL_EVENTS);
  const [elapsed, setElapsed] = useState(() =>
    boot
      ? boot.elapsed + Math.max(0, Math.floor((Date.now() - boot.savedAt) / 1000))
      : 0,
  );
  const [joinedAt, setJoinedAt] = useState<Record<string, number>>(
    () => boot?.joinedAt ?? {},
  );
  /** 当前任务从最近一次下发开始计时；老存档缺记录时按存档时刻起算，不把历史时间带进来 */
  const [dispatchAt, setDispatchAt] = useState<number>(() =>
    boot ? (boot.dispatchAt ?? boot.elapsed) : 0,
  );
  const [preview, setPreview] = useState<Attachment | null>(null);
  /** 设备掉线后录制时长冻结在掉线那一刻 */
  const [offlineAt, setOfflineAt] = useState<Record<string, number>>(
    () => boot?.offlineAt ?? {},
  );
  const [deviceTaskNames, setDeviceTaskNames] = useState<Record<string, string>>(
    () => boot?.names ?? {},
  );
  const [selectedHistory, setSelectedHistory] = useState<HistoryTask | null>(null);
  const [filterSite, setFilterSite] = useState("全部场区");
  const [filterBatch, setFilterBatch] = useState("");
  const [filterDevice, setFilterDevice] = useState("全部设备");
  /** 关键词搜索：任务名称、任务编号、负责人 */
  const [filterQuery, setFilterQuery] = useState("");
  /** 逐条复核：当前查看的任务名称与事件，以及尚未保存的人工结论/备注 */
  const [reviewTaskName, setReviewTaskName] = useState<string | null>(null);
  const [reviewEventId, setReviewEventId] = useState<string | null>(null);
  const [draftConclusion, setDraftConclusion] = useState<Conclusion | null>(null);
  const [draftNote, setDraftNote] = useState("");
  /** 复核列表按任务名称收起，点击任务行展开事件清单 */
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  /** 当前查看评分的设备；未选时取第一台 */
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  /** 每次进入新建任务都重建表单，默认参与设备取当前在线已连接设备 */
  const [formKey, setFormKey] = useState(0);

  const visibleTabs = TABS.filter((item) => (item.key === "new" ? canOperate : true));

  useEffect(() => {
    if (!newTaskSignal) return;
    if (!canOperate) {
      setTab("current");
      return;
    }
    setTab("new");
    setFormKey((k) => k + 1);
  }, [newTaskSignal, canOperate]);

  /** 角色切换后落在无权访问的页签时退回当前任务 */
  useEffect(() => {
    if (tab === "new" && !canOperate) setTab("current");
  }, [tab, canOperate]);

  const openNewTaskTab = () => {
    if (!canOperate) return;
    setTab("new");
    setFormKey((k) => k + 1);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  /** 每 5 秒落一次盘，刷新后按 savedAt 补回流逝的运行时长 */
  useEffect(() => {
    if (elapsed % 5 !== 0) return;
    const payload: StoredTaskState = {
      v: TASK_STATE_VERSION,
      task,
      names: deviceTaskNames,
      joinedAt,
      offlineAt,
      elapsed,
      dispatchAt,
      savedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(TASK_STATE_KEY, JSON.stringify(payload));
    } catch {
      /* 隐私模式下写入失败时仅保留内存状态 */
    }
  }, [task, deviceTaskNames, joinedAt, offlineAt, elapsed, dispatchAt]);

  /** 设备取消配对后任务同步摘掉该设备；一台不剩就是没有运行任务 */
  useEffect(() => {
    setTask((prev) => {
      if (prev.deviceIds.length === 0) return prev;
      const ids = prev.deviceIds.filter((id) => pairedIds.has(id));
      if (ids.length === prev.deviceIds.length) return prev;
      const kept = (prev.dispatchIds ?? []).filter((id) => ids.includes(id));
      return {
        ...prev,
        deviceIds: ids,
        dispatchIds: kept.length > 0 ? kept : ids,
      };
    });
  }, [pairedIds]);

  useEffect(() => {
    setOfflineAt((prev) => {
      let changed = false;
      const next = { ...prev };
      task.deviceIds.forEach((id) => {
        const device = devices.find((d) => d.id === id);
        if (device && !device.online && next[id] === undefined) {
          next[id] = elapsed;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [devices, task.deviceIds, elapsed]);

  const activeDevice =
    selectedDevice && task.deviceIds.includes(selectedDevice)
      ? selectedDevice
      : task.deviceIds[0] ?? null;
  const activeProfile = activeDevice ? scoreFor(activeDevice) : DEVICE_SCORES["01"];
  const activeTaskName = activeDevice ? deviceTaskNames[activeDevice] ?? activeDevice : "--";
  const activeFrac = Math.min(Math.max(activeProfile.score / 100, 0), 1);
  const totalDeduct = activeProfile.stages.reduce((sum, s) => sum + s.deduct, 0);
  const maxStageDeduct = Math.max(...activeProfile.stages.map((s) => s.deduct));
  const deductFocus = [...activeProfile.stages]
    .sort((a, b) => b.deduct - a.deduct)
    .slice(0, 2)
    .map((s) => s.name)
    .join(" 与 ");

  const spark = useMemo(() => {
    const values = activeProfile.recent;
    const w = 320;
    const h = 66;
    const pad = 6;
    const min = Math.min(...values) - 2;
    const max = Math.max(...values) + 2;
    const pts = values.map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / (values.length - 1);
      const y = pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
      return [x, y] as const;
    });
    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `M ${pad} ${h} L ${pts
      .map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" L ")} L ${w - pad} ${h} Z`;
    const [lx, ly] = pts[pts.length - 1];
    return { line, area, lx, ly, w, h };
  }, [activeProfile]);

  const sessions = useMemo(() => {
    const recorded: Record<string, number> = {};
    task.deviceIds.forEach((id) => {
      const end = offlineAt[id] ?? elapsed;
      recorded[id] = Math.max(0, end - (joinedAt[id] ?? 0));
    });
    return buildSessions(task.deviceIds, deviceTaskNames, recorded, task.operator);
  }, [task.deviceIds, deviceTaskNames, task.operator, joinedAt, offlineAt, elapsed]);

  const firstDevice = (task.dispatchIds ?? task.deviceIds)[0];
  const dispatchedCount = (task.dispatchIds ?? task.deviceIds).length;
  const taskTitle = firstDevice
    ? `${deviceTaskNames[firstDevice] ?? firstDevice}${
        dispatchedCount > 1 ? ` 等 ${dispatchedCount} 台` : ""
      }`
    : "暂无任务";

  /** 本轮未勾选、但仍按原任务运行的设备 */
  const continuedIds = task.deviceIds.filter(
    (id) => !(task.dispatchIds ?? task.deviceIds).includes(id),
  );

  /** 设备会话表按每台设备当前运行的任务名统计待复核数；承接运行的设备沿用原任务的事件 */
  const currentTaskEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          task.deviceIds.includes(e.device) && deviceTaskNames[e.device] === e.taskName,
      ),
    [events, task.deviceIds, deviceTaskNames],
  );

  const pendingByDevice = useMemo(() => {
    const map: Record<string, number> = {};
    currentTaskEvents.forEach((e) => {
      if (e.status === "待复核") map[e.device] = (map[e.device] ?? 0) + 1;
    });
    return map;
  }, [currentTaskEvents]);

  /** 复核页覆盖当前任务与历史任务 */
  const pendingCount = events.filter((e) => e.status === "待复核").length;
  const reviewedCount = events.length - pendingCount;

  /** 按任务名称分组：每台设备的一次下发即一个任务，当前任务置顶，其余按名称倒序 */
  const eventGroups = useMemo(() => {
    const map = new Map<string, EventGroup>();
    events.forEach((e) => {
      let group = map.get(e.taskName);
      if (!group) {
        group = {
          taskName: e.taskName,
          taskId: e.taskId,
          batch: e.batch,
          site: e.site,
          hall: e.hall,
          current: task.deviceIds.includes(e.device) && deviceTaskNames[e.device] === e.taskName,
          pending: 0,
          reviewed: 0,
          devices: [],
          events: [],
        };
        map.set(e.taskName, group);
      }
      group.events.push(e);
      if (!group.devices.includes(e.device)) group.devices.push(e.device);
      if (e.status === "待复核") group.pending += 1;
      else group.reviewed += 1;
    });
    return [...map.values()].sort((a, b) =>
      a.current === b.current ? b.taskName.localeCompare(a.taskName) : a.current ? -1 : 1,
    );
  }, [events, task.deviceIds, deviceTaskNames]);

  const filteredHistory = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    return history.filter(
      (h) =>
        (filterSite === "全部场区" || h.site === filterSite) &&
        (!filterBatch || h.batch.toLowerCase().includes(filterBatch.trim().toLowerCase())) &&
        (filterDevice === "全部设备" || h.deviceIds.includes(filterDevice)) &&
        (!query ||
          [h.name, h.id, h.operator].some((value) =>
            value.toLowerCase().includes(query),
          )),
    );
  }, [history, filterSite, filterBatch, filterDevice, filterQuery]);

  const updateEvent = (id: string, patch: Partial<ReviewEvent>) =>
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const reviewGroup = reviewTaskName
    ? eventGroups.find((group) => group.taskName === reviewTaskName) ?? null
    : null;
  const reviewEvent = reviewGroup?.events.find((e) => e.id === reviewEventId) ?? null;
  const reviewProfile = reviewEvent ? scoreFor(reviewEvent.device) : null;

  const selectReviewEvent = (event: ReviewEvent) => {
    setReviewEventId(event.id);
    setDraftConclusion(conclusionOf(event.status));
    setDraftNote(event.note);
  };

  const openReview = (group: EventGroup) => {
    const target = group.events.find((e) => e.status === "待复核") ?? group.events[0];
    setReviewTaskName(group.taskName);
    if (target) selectReviewEvent(target);
  };

  const toggleTask = (taskName: string) =>
    setExpandedTasks((prev) => ({ ...prev, [taskName]: !prev[taskName] }));

  const saveReview = () => {
    if (!reviewEvent || draftConclusion === null) return;
    updateEvent(reviewEvent.id, {
      status: statusOf(draftConclusion),
      reviewer: task.operator,
      note: draftNote,
    });
    notify("复核已保存", "success");
  };

  const handleCreate = (input: NewTaskInput) => {
    const at = new Date();
    const names: Record<string, string> = {};
    input.deviceIds.forEach((id) => {
      names[id] = `${input.name}-${deviceNo(id)}`;
    });
    /** 现行任务只保留仍处于配对中的设备；未勾选的继续原任务与计时 */
    const base = task.deviceIds.filter((id) => pairedIds.has(id));
    const continued = base.filter((id) => !input.deviceIds.includes(id));
    const runningIds = [
      ...base,
      ...input.deviceIds.filter((id) => !base.includes(id)),
    ];

    setDeviceTaskNames((prev) => ({ ...prev, ...names }));
    // 新下发设备从此刻重新计时；承接运行的设备保留原 joinedAt
    setJoinedAt((prev) => {
      const next: Record<string, number> = { ...prev };
      input.deviceIds.forEach((id) => {
        next[id] = elapsed;
      });
      return next;
    });
    setOfflineAt((prev) => {
      const next = { ...prev };
      input.deviceIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setDispatchAt(elapsed);
    setSelectedDevice(null);
    setSelectedHistory(null);
    setTask((prev) => ({
      ...prev,
      id: dispatchedTaskId(prev.id, at),
      site: input.site,
      hall: input.hall,
      scene: input.scene,
      batch: input.batch,
      operator: input.leader,
      date: input.date,
      location: input.location,
      deviceIds: runningIds,
      dispatchIds: input.deviceIds,
      startAt: clock(at),
      note: input.note,
      attachments: input.attachments,
    }));
    notify(
      continued.length > 0
        ? `已下发任务：${input.deviceIds.join("、")}；${continued.join("、")} 保持原任务继续运行`
        : `已下发任务：${input.deviceIds.join("、")}`,
      "success",
    );
    setTab("current");
  };

  return (
    <Page $hidden={hidden}>
      <Sidebar>
        <SideHead>
          <h1>任务信息</h1>
          <span>AI 作业规范评分 · 任务调度</span>
        </SideHead>
        {visibleTabs.map((item) => (
          <NavItem
            key={item.key}
            type="button"
            $active={tab === item.key}
            onClick={() => (item.key === "new" ? openNewTaskTab() : setTab(item.key))}
          >
            {item.label}
            {item.key === "current" && <NavRunDot $running={task.deviceIds.length > 0} />}
            {item.key === "review" && pendingCount > 0 && <NavBadge $warn>{pendingCount}</NavBadge>}
            {item.key === "history" && <NavBadge>{history.length}</NavBadge>}
          </NavItem>
        ))}
      </Sidebar>

      <Content>
        <ContentInner>
          {tab === "current" && task.deviceIds.length === 0 && (
            <>
              <SectionHead>
                <SectionTitle>当前任务</SectionTitle>
                <SectionHint>当前没有已接入的运行设备</SectionHint>
              </SectionHead>
              <Card>
                <EmptyNote>
                  暂无运行设备 · 请先在「设备配对」接入设备，再到「新建任务」下发
                </EmptyNote>
              </Card>
            </>
          )}

          {tab === "current" && task.deviceIds.length > 0 && (
            <>
              <SectionHead>
                <SectionTitle>当前任务</SectionTitle>
                <SectionHint>每台设备一条独立任务 · 评分不跨设备合并</SectionHint>
              </SectionHead>

              <Card>
                <CardBody>
                  <TaskTop>
                    <div>
                      <TaskNameRow>
                        <TaskName>{taskTitle}</TaskName>
                        <RunChip>
                          <RunDot />
                          运行中
                        </RunChip>
                      </TaskNameRow>
                      <TaskId>{task.id}</TaskId>
                    </div>
                    <TimerBlock>
                      <span>运行时长</span>
                      <b>{formatDuration(Math.max(0, elapsed - dispatchAt))}</b>
                    </TimerBlock>
                  </TaskTop>
                  <MetaGrid>
                    <Meta><span>场区</span><b>{task.site}</b></Meta>
                    <Meta><span>栋舍</span><b>{task.hall}</b></Meta>
                    <Meta><span>场景</span><b>{task.scene || "未指定"}</b></Meta>
                    <Meta><span>批次</span><b>{task.batch}</b></Meta>
                    <Meta><span>负责人</span><b>{task.operator}</b></Meta>
                    <Meta><span>作业日期</span><b>{task.date}</b></Meta>
                    <Meta><span>本次下发</span><b>{(task.dispatchIds ?? task.deviceIds).join("、")}</b></Meta>
                    {continuedIds.length > 0 && (
                      <Meta><span>承接运行</span><b>{continuedIds.join("、")}</b></Meta>
                    )}
                    <Meta>
                      <span>经纬度</span>
                      <b>{task.location || "未记录"}</b>
                    </Meta>
                    <Meta><span>开始时间</span><b>今天 {task.startAt}</b></Meta>
                  </MetaGrid>
                  {(task.note || task.attachments.length > 0) && (
                    <NoteLine>
                      {task.note && <span>备注：{task.note}</span>}
                      {task.attachments.length > 0 && (
                        <span>
                          附件：
                          {task.attachments.map((file, i) => (
                            <span key={file.name}>
                              <AttachLink
                                type="button"
                                title="查看附件"
                                onClick={() => setPreview(file)}
                              >
                                {file.name}
                              </AttachLink>
                              {i < task.attachments.length - 1 ? "、" : ""}
                            </span>
                          ))}
                        </span>
                      )}
                    </NoteLine>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHead>
                  <CardTitle>设备会话</CardTitle>
                  <HeadHint>每台设备独立评分 · 点击设备查看下方评分</HeadHint>
                </CardHead>
                <CardBody>
                  <SessionTable
                    rows={sessions}
                    pending={pendingByDevice}
                    selected={activeDevice}
                    onSelect={setSelectedDevice}
                  />
                </CardBody>
              </Card>

              <TwoCol>
                <Card>
                  <CardHead>
                    <CardTitle>评分概览</CardTitle>
                    <HeadHint>{activeDevice ?? "--"} · {activeTaskName} · 规则 v1.3</HeadHint>
                  </CardHead>
                  <CardBody>
                    <ScoreWrap>
                      <GaugeWrap>
                        <GaugeGlow />
                        <GaugeSvg viewBox="0 0 80 80" role="img" aria-label={`当前分数 ${activeProfile.score.toFixed(1)}`}>
                          <defs>
                            <linearGradient id="task-score-arc" x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor={HUD.ok} stopOpacity={0.5} />
                              <stop offset="100%" stopColor={HUD.ok} />
                            </linearGradient>
                          </defs>
                          <path d={RING_PATH} fill="none" stroke={HUD.line} strokeWidth={5.5} strokeLinecap="round" />
                          <path
                            d={RING_PATH}
                            fill="none"
                            stroke="url(#task-score-arc)"
                            strokeWidth={5.5}
                            strokeLinecap="round"
                            strokeDasharray={`${activeFrac * RING_LEN} ${RING_LEN}`}
                            style={{ filter: `drop-shadow(0 0 4px ${HUD.ok}66)` }}
                          />
                        </GaugeSvg>
                        <GaugeText>
                          <b>{activeProfile.score.toFixed(1)}</b>
                          <span>当前分数</span>
                        </GaugeText>
                      </GaugeWrap>

                      <SideStats>
                        <Delta $down={activeProfile.delta < 0}>
                          <b>{activeProfile.delta >= 0 ? "+" : ""}{activeProfile.delta.toFixed(1)}</b>
                          <span>较上次</span>
                        </Delta>
                        <StatLine><span>近 5 次均值</span><b>{activeProfile.avg5.toFixed(1)}</b></StatLine>
                        <StatLine>
                          <span>近 10 次变化</span>
                          <b>
                            {activeProfile.trend >= 0 ? "+" : ""}
                            {activeProfile.trend.toFixed(1)} / 次
                          </b>
                        </StatLine>
                        <CountLine>
                          本任务评定 {activeProfile.evaluated} 次 · 有效 {activeProfile.effective} · 不可评估{" "}
                          {activeProfile.evaluated - activeProfile.effective}
                        </CountLine>
                      </SideStats>

                      <Spark>
                        <svg viewBox={`0 0 ${spark.w} ${spark.h}`} preserveAspectRatio="none" aria-hidden>
                          <defs>
                            <linearGradient id="task-spark-fill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={HUD.cyan} stopOpacity={0.26} />
                              <stop offset="100%" stopColor={HUD.cyan} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <path d={spark.area} fill="url(#task-spark-fill)" />
                          <polyline
                            points={spark.line}
                            fill="none"
                            stroke={HUD.cyan}
                            strokeWidth={1.6}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                          <circle cx={spark.lx} cy={spark.ly} r={2.6} fill={HUD.cyan} />
                        </svg>
                        <span>最近 10 次评分</span>
                      </Spark>
                    </ScoreWrap>
                  </CardBody>
                </Card>

                <Card>
                  <CardHead>
                    <CardTitle>评分标准</CardTitle>
                    <HeadHint>当前模板 · 权重可调</HeadHint>
                  </CardHead>
                  <CardBody>
                    <MetricsRow>
                      <Tag $tone="cyan">
                        有效事件 {activeProfile.effective} / {activeProfile.evaluated}
                      </Tag>
                      <Tag $tone="dim">覆盖率 {activeProfile.coverage}%</Tag>
                      <Tag $tone="gold">暂评</Tag>
                    </MetricsRow>
                    <RuleList>
                      {activeProfile.rules.map((rule) => {
                        const ratio = rule.got / rule.max;
                        const color = ratio >= 0.9 ? HUD.ok : ratio >= 0.75 ? HUD.cyan : HUD.gold;
                        return (
                          <RuleRow key={rule.name}>
                            <RuleName>{rule.name}</RuleName>
                            <RuleTrack>
                              <RuleFill $pct={ratio * 100} $color={color} />
                            </RuleTrack>
                            <RuleValue>
                              {rule.got} <i>/ {rule.max}</i>
                            </RuleValue>
                          </RuleRow>
                        );
                      })}
                    </RuleList>
                  </CardBody>
                </Card>
              </TwoCol>

              <Card>
                <CardHead>
                  <CardTitle>评分版本</CardTitle>
                  <HeadHint>复核改分另存版本，原始 AI 判定保留</HeadHint>
                </CardHead>
                <CardBody>
                  <VersionList>
                    {activeProfile.versions.map((version) => {
                      const current = version.tag === "当前";
                      return (
                        <VersionRow key={version.name} $current={current}>
                          <VersionName>{version.name}</VersionName>
                          <span>{version.label}</span>
                          <VersionScore>{version.score.toFixed(1)}</VersionScore>
                          <span>覆盖 {version.coverage}%</span>
                          <VersionDesc>{version.desc}</VersionDesc>
                          <Tag $tone={current ? "cyan" : "dim"}>{version.tag}</Tag>
                        </VersionRow>
                      );
                    })}
                  </VersionList>
                </CardBody>
              </Card>

              <Card>
                <CardHead>
                  <CardTitle>扣分图</CardTitle>
                  <HeadHint>共扣 {totalDeduct} 分 · 集中在 {deductFocus}</HeadHint>
                </CardHead>
                <CardBody>
                  <StageChart>
                    {activeProfile.stages.map((stage) => (
                      <StageCol key={stage.name}>
                        <StageDeduct>−{stage.deduct}</StageDeduct>
                        <BarArea>
                          <Bar $pct={(stage.deduct / maxStageDeduct) * 100} />
                        </BarArea>
                        <StageName>{stage.name}</StageName>
                        <StageCount>{stage.count} 次</StageCount>
                      </StageCol>
                    ))}
                  </StageChart>
                </CardBody>
              </Card>
            </>
          )}

          {tab === "new" && (
            <>
              <SectionHead>
                <SectionTitle>新建任务</SectionTitle>
                <SectionHint>参与设备从已配对列表多选；下发只影响本次勾选的设备，其余运行中设备保持原任务</SectionHint>
              </SectionHead>
              <NewTaskForm
                key={formKey}
                devices={devices}
                runningIds={task.deviceIds}
                onCreate={handleCreate}
              />
            </>
          )}

          {tab === "review" && reviewGroup && (
            <>
              <SectionHead>
                <SectionTitle>任务详情与复核</SectionTitle>
                <SectionHint>
                  任务 {reviewGroup.taskName} · 批次 {reviewGroup.batch} · {reviewGroup.site}{" "}
                  {reviewGroup.hall} · 待复核 {reviewGroup.pending} / {reviewGroup.events.length}
                </SectionHint>
                <HeadActions>
                  <SmallBtn type="button" onClick={() => setReviewTaskName(null)}>
                    ← 返回复核列表
                  </SmallBtn>
                </HeadActions>
              </SectionHead>

              <ReviewGrid>
                <ReviewCol>
                  <Card>
                    <CardHead>
                      <CardTitle>事件时间线</CardTitle>
                      <HeadHint>
                        {reviewGroup.devices.join("、")} · 共 {reviewGroup.events.length} 条
                      </HeadHint>
                    </CardHead>
                    <TimelineBody>
                      {reviewGroup.events.map((e) => (
                        <TimelineItem
                          key={e.id}
                          type="button"
                          $active={e.id === reviewEventId}
                          onClick={() => selectReviewEvent(e)}
                        >
                          <TimelineTitle>
                            {e.time} · {e.action} · {e.conf.toFixed(2)}
                          </TimelineTitle>
                          <TimelineMeta>
                            片段 {e.clip} · {e.evaluable}
                            {e.status !== "待复核" && (
                              <span
                                style={{
                                  color:
                                    e.status === "已确认"
                                      ? HUD.ok
                                      : e.status === "已驳回"
                                        ? HUD.danger
                                        : HUD.gold,
                                }}
                              >
                                {" · "}
                                {e.status}
                              </span>
                            )}
                          </TimelineMeta>
                        </TimelineItem>
                      ))}
                    </TimelineBody>
                  </Card>

                  <Card>
                    <CardHead>
                      <CardTitle>片段回放</CardTitle>
                      <HeadHint>{reviewEvent ? reviewEvent.clip : "选择事件后定位片段"}</HeadHint>
                    </CardHead>
                    <CardBody>
                      <ClipStage>
                        {reviewEvent && (
                          <ClipTag>
                            {reviewEvent.time} · {reviewEvent.action}
                          </ClipTag>
                        )}
                        <span>5 秒片段播放器 · 设备时间轴对齐 · 支持逐帧</span>
                      </ClipStage>
                    </CardBody>
                  </Card>
                </ReviewCol>

                <ReviewCol>
                  {reviewEvent && (
                    <>
                      <Card>
                        <CardHead>
                          <CardTitle>复核 · 事件 {reviewEvent.id}</CardTitle>
                          <HeadHint>
                            {reviewGroup.current ? "当前任务" : "历史任务"} · {reviewEvent.device}
                          </HeadHint>
                        </CardHead>
                        <ReviewRows>
                          <ReviewRow>
                            <ReviewLabel>AI 原判定</ReviewLabel>
                            <ReviewValue>
                              <b>
                                {reviewEvent.action} · 置信度 {reviewEvent.conf.toFixed(2)}
                              </b>
                              <ReviewSub>模型 hand-pose-2d · 规则 {reviewEvent.rule}</ReviewSub>
                              <ReviewSub
                                style={{
                                  color: reviewEvent.ai === "违规" ? HUD.orange : HUD.ok,
                                }}
                              >
                                AI 判定{reviewEvent.ai} · {reviewEvent.aiReason}
                              </ReviewSub>
                            </ReviewValue>
                          </ReviewRow>
                          <ReviewRow>
                            <ReviewLabel>人工结论</ReviewLabel>
                            <ReviewValue>
                              <ConclusionGroup>
                                <ConclusionBtn
                                  type="button"
                                  $tone="ok"
                                  $active={draftConclusion === "有效"}
                                  disabled={!canOperate}
                                  onClick={() => setDraftConclusion("有效")}
                                >
                                  有效
                                </ConclusionBtn>
                                <ConclusionBtn
                                  type="button"
                                  $tone="danger"
                                  $active={draftConclusion === "无效"}
                                  disabled={!canOperate}
                                  onClick={() => setDraftConclusion("无效")}
                                >
                                  无效
                                </ConclusionBtn>
                                <ConclusionBtn
                                  type="button"
                                  $tone="gold"
                                  $active={draftConclusion === "无法判定"}
                                  disabled={!canOperate}
                                  onClick={() => setDraftConclusion("无法判定")}
                                >
                                  无法判定
                                </ConclusionBtn>
                              </ConclusionGroup>
                              {!canOperate && (
                                <ReviewSub>
                                  只读角色仅可查看，提交复核需 operator 或 admin
                                </ReviewSub>
                              )}
                            </ReviewValue>
                          </ReviewRow>
                          <ReviewRow>
                            <ReviewLabel>备注</ReviewLabel>
                            <ReviewValue>
                              <NoteArea
                                value={draftNote}
                                placeholder="复核备注（选填）"
                                aria-label="复核备注"
                                disabled={!canOperate}
                                onChange={(ev) => setDraftNote(ev.target.value)}
                              />
                            </ReviewValue>
                          </ReviewRow>
                        </ReviewRows>
                        <SaveRow>
                          <SmallBtn
                            type="button"
                            $primary
                            disabled={!canOperate || draftConclusion === null}
                            onClick={saveReview}
                          >
                            保存复核
                          </SmallBtn>
                          <SaveHint>
                            {canOperate
                              ? "保存后写入审计 reviewer_id"
                              : "只读角色不可提交复核"}
                          </SaveHint>
                        </SaveRow>
                      </Card>

                      <Card>
                        <CardHead>
                          <CardTitle>评分</CardTitle>
                          <HeadHint>按设备独立评分 · 人工结论不覆盖原始判定</HeadHint>
                        </CardHead>
                        <CardBody>
                          <MetaGrid>
                            <Meta>
                              <span>暂评</span>
                              <b>{reviewProfile ? reviewProfile.score : "--"}</b>
                            </Meta>
                            <Meta>
                              <span>覆盖率</span>
                              <b>{reviewProfile ? `${reviewProfile.coverage}%` : "--"}</b>
                            </Meta>
                            <Meta>
                              <span>可评估事件</span>
                              <b>{reviewGroup.events.length}</b>
                            </Meta>
                            <Meta>
                              <span>版本</span>
                              <b>v1</b>
                            </Meta>
                          </MetaGrid>
                        </CardBody>
                      </Card>
                    </>
                  )}
                </ReviewCol>
              </ReviewGrid>
            </>
          )}

          {tab === "review" && !reviewGroup && (
            <>
              <SectionHead>
                <SectionTitle>事件复核</SectionTitle>
                <SectionHint>
                  待复核 {pendingCount} · 已复核 {reviewedCount} · 按任务名称拆分，覆盖当前与历史任务
                </SectionHint>
              </SectionHead>
              {eventGroups.length === 0 ? (
                <Card>
                  <EmptyNote>暂无复核事件</EmptyNote>
                </Card>
              ) : (
                eventGroups.map((group) => {
                  const open = Boolean(expandedTasks[group.taskName]);
                  return (
                    <Card key={group.taskName}>
                      <GroupHeadRow>
                        <GroupToggle
                          type="button"
                          aria-expanded={open}
                          onClick={() => toggleTask(group.taskName)}
                        >
                          <Caret $open={open} aria-hidden="true">
                            ▸
                          </Caret>
                          <GroupHeadMain>
                            <GroupTitleRow>
                              <GroupName>{group.taskName}</GroupName>
                              <Tag $tone={group.current ? "ok" : "dim"}>
                                {group.current ? "当前任务" : "历史任务"}
                              </Tag>
                              <Tag $tone={group.pending ? "gold" : "dim"}>
                                待复核 {group.pending}
                              </Tag>
                              <Tag $tone="dim">已复核 {group.reviewed}</Tag>
                            </GroupTitleRow>
                            <GroupMeta>
                              批次 {group.batch} · {group.site} {group.hall} ·{" "}
                              {group.devices.join("、")} · 共 {group.events.length} 条事件
                            </GroupMeta>
                          </GroupHeadMain>
                        </GroupToggle>
                        <ReviewLink type="button" onClick={() => openReview(group)}>
                          逐条复核 ›
                        </ReviewLink>
                      </GroupHeadRow>
                      {open && (
                        <EventList>
                          {group.events.map((e) => (
                            <EventRow key={e.id}>
                              <EventHead>
                                <EventTime>{e.time}</EventTime>
                                <EventDevice>{e.device}</EventDevice>
                                <EventTitle>{e.action}</EventTitle>
                                <Tag
                                  $tone={
                                    e.status === "待复核"
                                      ? "gold"
                                      : e.status === "已确认"
                                        ? "ok"
                                        : e.status === "无法判定"
                                          ? "dim"
                                          : "danger"
                                  }
                                  style={{ marginLeft: "auto" }}
                                >
                                  {e.status}
                                </Tag>
                              </EventHead>
                              <EventMeta>
                                置信度 {e.conf.toFixed(2)} · {e.rule} · {e.evaluable} · 片段{" "}
                                {e.clip}
                              </EventMeta>
                              {e.status !== "待复核" ? (
                                <EventMeta>
                                  复核：{e.reviewer}
                                  {e.note ? ` · ${e.note}` : ""}
                                </EventMeta>
                              ) : (
                                !canOperate && (
                                  <EventMeta>待复核 · 只读角色仅可查看</EventMeta>
                                )
                              )}
                            </EventRow>
                          ))}
                        </EventList>
                      )}
                    </Card>
                  );
                })
              )}
            </>
          )}

          {tab === "history" && selectedHistory && (
            <>
              <SectionHead>
                <SectionTitle>任务详情</SectionTitle>
                <SectionHint>{selectedHistory.id} · {selectedHistory.name}</SectionHint>
                <HeadActions>
                  <SmallBtn type="button" onClick={() => setSelectedHistory(null)}>
                    返回列表
                  </SmallBtn>
                  <SmallBtn type="button" $primary onClick={() => exportCsv(selectedHistory)}>
                    导出 CSV
                  </SmallBtn>
                </HeadActions>
              </SectionHead>

              <Card>
                <CardHead>
                  <CardTitle>任务资料</CardTitle>
                  <HeadHint>按设备任务独立保存</HeadHint>
                </CardHead>
                <CardBody>
                  <MetaGrid>
                    <Meta><span>场区</span><b>{selectedHistory.site}</b></Meta>
                    <Meta><span>栋舍</span><b>{selectedHistory.hall}</b></Meta>
                    <Meta><span>批次</span><b>{selectedHistory.batch}</b></Meta>
                    <Meta><span>负责人</span><b>{selectedHistory.operator}</b></Meta>
                    <Meta><span>作业日期</span><b>{selectedHistory.date}</b></Meta>
                    <Meta><span>开始时间</span><b>{selectedHistory.startAt}</b></Meta>
                    <Meta><span>时长</span><b>{selectedHistory.duration}</b></Meta>
                    <Meta><span>参与设备</span><b>{selectedHistory.deviceIds.join("、")}</b></Meta>
                    <Meta><span>评分</span><b>{selectedHistory.score === null ? "-- 数据不足" : selectedHistory.score.toFixed(1)}</b></Meta>
                    <Meta><span>覆盖率</span><b>{selectedHistory.coverage === null ? "--" : `${selectedHistory.coverage}%`}</b></Meta>
                    <Meta><span>状态</span><b>{selectedHistory.status}</b></Meta>
                  </MetaGrid>
                  <NoteLine>
                    <span>
                      附件：{selectedHistory.attachments.length ? selectedHistory.attachments.join("、") : "无"}
                    </span>
                  </NoteLine>
                </CardBody>
              </Card>

              <Card>
                <CardHead>
                  <CardTitle>设备会话</CardTitle>
                  <HeadHint>多台设备评分独立，不直接相加</HeadHint>
                </CardHead>
                <CardBody>
                  <SessionTable rows={buildHistorySessions(selectedHistory)} />
                </CardBody>
              </Card>
            </>
          )}

          {tab === "history" && !selectedHistory && (
            <>
              <SectionHead>
                <SectionTitle>历史任务</SectionTitle>
                <SectionHint>共 {filteredHistory.length} 条 · 点击行查看详情与导出</SectionHint>
              </SectionHead>
              <Card>
                <CardBody>
                  <FilterBar>
                    <FilterInput
                      value={filterBatch}
                      placeholder="批次，如 B-1118"
                      aria-label="按批次筛选"
                      onChange={(e) => setFilterBatch(e.target.value)}
                    />
                    <FilterInput
                      value={filterQuery}
                      placeholder="搜索任务名称 / 负责人"
                      aria-label="搜索任务"
                      onChange={(e) => setFilterQuery(e.target.value)}
                      style={{ width: 190 }}
                    />
                    <FilterSelect
                      value={filterSite}
                      aria-label="按场区筛选"
                      onChange={(e) => setFilterSite(e.target.value)}
                    >
                      <option value="全部场区">全部场区</option>
                      {SITES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </FilterSelect>
                    <FilterSelect
                      value={filterDevice}
                      aria-label="按设备筛选"
                      onChange={(e) => setFilterDevice(e.target.value)}
                    >
                      <option value="全部设备">全部设备</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>{d.id}</option>
                      ))}
                    </FilterSelect>
                  </FilterBar>
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <th>批次</th>
                          <th>任务名称</th>
                          <th>负责人</th>
                          <th>场区 · 栋舍</th>
                          <th className="col-sm-hide">开始时间</th>
                          <th className="col-sm-hide">时长</th>
                          <th>评分</th>
                          <th>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistory.map((h) => (
                          <tr
                            key={h.id}
                            onClick={() => setSelectedHistory(h)}
                            style={{ cursor: "pointer" }}
                          >
                            <td><MonoCell>{h.batch}</MonoCell></td>
                            <td>{h.name}</td>
                            <td>{h.operator}</td>
                            <td>{h.site} · {h.hall}</td>
                            <td className="col-sm-hide"><MonoCell>{h.startAt}</MonoCell></td>
                            <td className="col-sm-hide"><MonoCell>{h.duration}</MonoCell></td>
                            <td>
                              <ScoreCell $none={h.score === null}>
                                {h.score === null ? "不可评估" : h.score.toFixed(1)}
                              </ScoreCell>
                            </td>
                            <td><Tag $tone="ok">{h.status}</Tag></td>
                          </tr>
                        ))}
                        {filteredHistory.length === 0 && (
                          <tr>
                            <td colSpan={8}>
                              <EmptyNote style={{ padding: "14px 0" }}>没有符合条件的任务</EmptyNote>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </TableWrap>
                </CardBody>
              </Card>
            </>
          )}
        </ContentInner>
      </Content>

      <AttachmentDialog attachment={preview} onClose={() => setPreview(null)} />
    </Page>
  );
}