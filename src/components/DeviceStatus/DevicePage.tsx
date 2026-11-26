import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { useNotification } from "../../contexts/NotificationContext";

type Phase = "running" | "online" | "offline" | "fault";
type Tone = "ok" | "gold" | "cyan" | "danger" | "dim";

const MONO = '"Roboto Mono", "Consolas", monospace';

const TONE_COLOR: Record<Tone, string> = {
  ok: HUD.ok,
  gold: HUD.gold,
  cyan: HUD.cyan,
  danger: HUD.danger,
  dim: HUD.textDim,
};

const PHASE_META: Record<Phase, { label: string; tone: Tone; hint: string }> = {
  running: { label: "运行中", tone: "ok", hint: "实时画面 · 任务执行中" },
  online: { label: "在线", tone: "cyan", hint: "在线待命 · 暂未下发任务" },
  offline: { label: "离线", tone: "dim", hint: "最后数据保留 · 非实时" },
  fault: { label: "故障", tone: "danger", hint: "故障停机 · 最后数据保留" },
};


/** 单路预览可切换的三路画面来源 */
type Channel = "left" | "right" | "effect";

const CHANNEL_LABEL: Record<Channel, string> = {
  left: "左目",
  right: "右目",
  effect: "手部图",
};

interface RecentEvent {
  at: string;
  action: string;
  result: string;
  tone: Tone;
}

/** 设备历史任务记录：详情页只展示最近三次 */
interface TaskRecord {
  /** 任务名称 = 下发时刻-设备号 */
  name: string;
  operator: string;
  start: string;
  events: number;
  score: number;
}

interface ManagedDevice {
  id: string;
  /** 现场位置，如「A3 栋东侧」 */
  alias: string;
  paired: boolean;
  phase: Phase;
  battery: number | null;
  /** Wi-Fi 信号强度，dBm */
  rssi: number | null;
  heartbeatAgo: string;
  /** 最后一次心跳的绝对时间；在线时留空 */
  heartbeatAt: string;
  task: string;
  /** AI 暂评分；未执行任务的设备为空 */
  score: number | null;
  reviewPending: number;
  videoAt: string;
  pendingFiles: number;
  pendingSize: string;
  recentEvents: RecentEvent[];
  /** 最近三次任务记录，新的在前 */
  sessions: TaskRecord[];
  fault?: string;
}

const INITIAL_DEVICES: ManagedDevice[] = [
  {
    id: "头盔-01",
    alias: "A3 栋东侧",
    paired: true,
    phase: "running",
    battery: 86,
    rssi: -52,
    heartbeatAgo: "1s 前",
    heartbeatAt: "",
    task: "运行中",
    score: 78,
    reviewPending: 2,
    videoAt: "2 秒前",
    pendingFiles: 2,
    pendingSize: "3.2GB",
    recentEvents: [
      { at: "10:41:07", action: "抓取", result: "合规", tone: "ok" },
      { at: "10:40:52", action: "转移", result: "待复核", tone: "gold" },
      { at: "10:39:31", action: "抓取", result: "不可评估", tone: "dim" },
    ],
    sessions: [
      { name: "20261124-1002-01", operator: "张三", start: "今日 10:02", events: 24, score: 78 },
      { name: "20261123-1540-01", operator: "李四", start: "昨日 15:40", events: 31, score: 84 },
      { name: "20261121-0912-01", operator: "张三", start: "11-21 09:12", events: 18, score: 81 },
    ],
  },
  {
    id: "头盔-02",
    alias: "A3 栋西侧",
    paired: true,
    phase: "online",
    battery: 64,
    rssi: -61,
    heartbeatAgo: "1s 前",
    heartbeatAt: "",
    task: "空闲",
    score: null,
    reviewPending: 0,
    videoAt: "刚刚",
    pendingFiles: 0,
    pendingSize: "0",
    recentEvents: [],
    sessions: [
      { name: "20261123-1620-02", operator: "李四", start: "昨日 16:20", events: 20, score: 86 },
      { name: "20261122-0845-02", operator: "张三", start: "11-22 08:45", events: 27, score: 82 },
      { name: "20261121-1402-02", operator: "李四", start: "11-21 14:02", events: 15, score: 79 },
    ],
  },
  {
    id: "头盔-03",
    alias: "B1 栋",
    paired: true,
    phase: "offline",
    battery: null,
    rssi: null,
    heartbeatAgo: "3 分 12 秒前",
    heartbeatAt: "10:48:02",
    task: "已离线",
    score: null,
    reviewPending: 0,
    videoAt: "10:48:02",
    pendingFiles: 1,
    pendingSize: "812MB",
    recentEvents: [],
    sessions: [
      { name: "20261124-0948-03", operator: "王五", start: "今日 09:48", events: 12, score: 74 },
      { name: "20261123-1035-03", operator: "张三", start: "昨日 10:35", events: 22, score: 80 },
      { name: "20261122-1518-03", operator: "王五", start: "11-22 15:18", events: 16, score: 77 },
    ],
  },
  {
    id: "头盔-04",
    alias: "B2 栋",
    paired: true,
    phase: "fault",
    battery: null,
    rssi: null,
    heartbeatAgo: "刚刚",
    heartbeatAt: "",
    task: "故障停机",
    score: null,
    reviewPending: 0,
    videoAt: "4.2s",
    pendingFiles: 5,
    pendingSize: "6.8GB",
    recentEvents: [],
    sessions: [
      { name: "20261124-1040-04", operator: "张三", start: "今日 10:40", events: 9, score: 71 },
      { name: "20261123-1305-04", operator: "李四", start: "昨日 13:05", events: 25, score: 83 },
      { name: "20261122-0930-04", operator: "张三", start: "11-22 09:30", events: 21, score: 80 },
    ],
    fault: "写盘失败 3 次 · 存储只读",
  },
];

/** 单路详情的硬件信号读数（演示数据；电量按设备实测值，读不到显示 --） */
interface HardwareReading {
  clock: string;
  temp: string;
  infer: string;
  frameAge: string;
  fps: string;
  drop: string;
  mgmt: string;
  inet: string;
  latency: string;
  firstFrame: string;
  shutdown: string;
  free: string;
  writeFails: string;
}

const HARDWARE: Record<string, HardwareReading> = {
  "头盔-01": {
    clock: "已同步",
    temp: "46.8 ℃",
    infer: "38 ms",
    frameAge: "0.3 s",
    fps: "30.0 fps",
    drop: "0.02%",
    mgmt: "可达",
    inet: "可达",
    latency: "165 ms",
    firstFrame: "0.8 s",
    shutdown: "正常",
    free: "41.6 GB · 65%",
    writeFails: "0",
  },
  "头盔-02": {
    clock: "已同步",
    temp: "41.2 ℃",
    infer: "36 ms",
    frameAge: "--",
    fps: "--",
    drop: "--",
    mgmt: "可达",
    inet: "可达",
    latency: "--",
    firstFrame: "--",
    shutdown: "正常",
    free: "47.9 GB · 75%",
    writeFails: "0",
  },
  "头盔-03": {
    clock: "--",
    temp: "--",
    infer: "--",
    frameAge: "--",
    fps: "--",
    drop: "--",
    mgmt: "不可达",
    inet: "不可达",
    latency: "--",
    firstFrame: "--",
    shutdown: "未知",
    free: "--",
    writeFails: "--",
  },
  "头盔-04": {
    clock: "已同步",
    temp: "62.4 ℃",
    infer: "--",
    frameAge: "4.2 s",
    fps: "0 fps",
    drop: "--",
    mgmt: "可达",
    inet: "不可达",
    latency: "--",
    firstFrame: "--",
    shutdown: "异常",
    free: "6.1 GB · 9%",
    writeFails: "3",
  },
};

const EMPTY_READING: HardwareReading = {
  clock: "--",
  temp: "--",
  infer: "--",
  frameAge: "--",
  fps: "--",
  drop: "--",
  mgmt: "--",
  inet: "--",
  latency: "--",
  firstFrame: "--",
  shutdown: "--",
  free: "--",
  writeFails: "--",
};

interface SignalItem {
  label: string;
  value: string;
  tone?: Tone;
}

interface SignalGroup {
  key: string;
  label: string;
  items: SignalItem[];
}

const readingNum = (text: string) => {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : null;
};
const badValue = (value: string, bad: string, tone: Tone): Tone | undefined =>
  value === "--" ? "dim" : value === bad ? tone : undefined;

/** 单台设备的信号清单：类别按固定顺序排列 */
const signalGroupsFor = (device: ManagedDevice): SignalGroup[] => {
  const h = HARDWARE[device.id] ?? EMPTY_READING;
  const temp = readingNum(h.temp);
  const freePct = h.free.includes("·") ? readingNum(h.free.split("·")[1]) : null;
  const writeFails = readingNum(h.writeFails);
  const battery = device.battery;
  return [
    {
      key: "board",
      label: "计算板",
      items: [
        { label: "校时状态", value: h.clock, tone: badValue(h.clock, "未同步", "gold") },
        { label: "板温", value: h.temp, tone: temp !== null && temp >= 60 ? "gold" : undefined },
        { label: "推理耗时", value: h.infer },
      ],
    },
    {
      key: "camera",
      label: "相机",
      items: [
        { label: "末帧年龄", value: h.frameAge },
        { label: "帧率", value: h.fps, tone: h.fps === "0 fps" ? "danger" : undefined },
        { label: "丢帧率", value: h.drop },
      ],
    },
    {
      key: "network",
      label: "网络",
      items: [
        { label: "Wi-Fi 信号", value: wifiText(device.rssi) },
        { label: "管理服务可达", value: h.mgmt, tone: badValue(h.mgmt, "不可达", "gold") },
        { label: "互联网可达", value: h.inet, tone: badValue(h.inet, "不可达", "gold") },
      ],
    },
    {
      key: "stream",
      label: "预览推流",
      items: [
        { label: "端到端延迟", value: h.latency },
        { label: "首帧时间", value: h.firstFrame },
      ],
    },
    {
      key: "battery",
      label: "电池",
      items: [
        {
          label: "电量",
          value: battery === null ? "--" : `${battery}%`,
          tone: battery === null ? "dim" : battery < 10 ? "danger" : battery < 45 ? "gold" : undefined,
        },
      ],
    },
    {
      key: "power",
      label: "电源通路",
      items: [
        {
          label: "上次是否正常关闭",
          value: h.shutdown,
          tone: h.shutdown === "异常" ? "danger" : h.shutdown === "未知" ? "dim" : undefined,
        },
      ],
    },
    {
      key: "storage",
      label: "存储",
      items: [
        {
          label: "剩余空间",
          value: h.free,
          tone: freePct !== null && freePct < 20 ? (freePct < 10 ? "danger" : "gold") : undefined,
        },
        { label: "待上传量", value: device.pendingSize },
        {
          label: "写盘失败次数",
          value: h.writeFails,
          tone: writeFails !== null && writeFails > 0 ? "danger" : undefined,
        },
      ],
    },
  ];
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const clock = (d = new Date()) =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

const wifiText = (rssi: number | null) => {
  if (rssi === null) return "--";
  const strength = rssi >= -55 ? "强" : rssi >= -67 ? "中" : "弱";
  return `${rssi} dBm · ${strength}`;
};

const heartbeatText = (d: ManagedDevice) =>
  d.heartbeatAt ? `${d.heartbeatAgo} · ${d.heartbeatAt}` : d.heartbeatAgo;

/* ---------- 页面骨架 ---------- */

const Page = styled("div")(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  backgroundColor: theme.palette.background.default,
  padding: "18px 22px 28px",
  "@media (max-width: 720px)": { padding: "14px 12px 22px" },
}));

const Shell = styled("div")({
  width: "100%",
  maxWidth: 1320,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
});

const PageHead = styled("div")({
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  "& h1": {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: 0.3,
    color: HUD.text,
  },
  "& p": {
    margin: "5px 0 0",
    fontSize: 11,
    letterSpacing: 0.2,
    color: HUD.textDim,
    "& b": {
      fontFamily: MONO,
      fontWeight: 500,
      color: HUD.text,
      letterSpacing: 0.4,
    },
  },
});

const Actions = styled("div")({
  display: "flex",
  gap: 8,
  flexShrink: 0,
});

const ActionBtn = styled("button")<{ $primary?: boolean }>(({ $primary }) => ({
  height: 30,
  padding: "0 12px",
  borderRadius: 5,
  border: `1px solid ${$primary ? "rgba(63, 178, 255, 0.4)" : HUD.lineSoft}`,
  background: $primary ? "rgba(63, 178, 255, 0.12)" : "transparent",
  color: $primary ? HUD.cyan : HUD.textDim,
  fontSize: 11.5,
  letterSpacing: 0.4,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background-color 160ms ease, color 160ms ease, border-color 160ms ease",
  "&:hover": {
    borderColor: $primary ? "rgba(63, 178, 255, 0.6)" : "rgba(126, 162, 205, 0.28)",
    color: $primary ? HUD.cyan : HUD.text,
    backgroundColor: $primary ? "rgba(63, 178, 255, 0.18)" : "rgba(255, 255, 255, 0.04)",
  },
  "&:disabled": { opacity: 0.5, cursor: "default" },
}));

const SummaryRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
});

const CountChip = styled("span")<{ $tone: Tone }>(({ $tone }) => {
  const color = TONE_COLOR[$tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 9px",
    borderRadius: 5,
    border: `1px solid ${color}38`,
    backgroundColor: `${color}0d`,
    color,
    fontSize: 10.5,
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
    "& b": {
      fontFamily: MONO,
      fontSize: 13,
      fontWeight: 500,
      fontVariantNumeric: "tabular-nums",
    },
  };
});

const SummaryHint = styled("span")({
  marginLeft: "auto",
  fontSize: 10.5,
  letterSpacing: 0.3,
  color: HUD.textDim,
  "@media (max-width: 720px)": { marginLeft: 0 },
});

const Grid = styled("div")({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: 12,
});

/* ---------- 设备卡片 ---------- */

const DeviceCard = styled("button")<{ $phase: Phase }>(({ theme, $phase }) => ({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  padding: 0,
  textAlign: "left",
  font: "inherit",
  color: HUD.text,
  border: `1px solid ${$phase === "fault" ? "rgba(245, 73, 102, 0.55)" : theme.palette.divider}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
  overflow: "hidden",
  cursor: "pointer",
  opacity: $phase === "offline" ? 0.6 : 1,
  transition: "border-color 180ms ease, background-color 180ms ease, opacity 180ms ease",
  "&:not(:disabled):hover": {
    borderColor: "rgba(96, 176, 255, 0.32)",
    backgroundColor: HUD.panelSoft,
  },
  "&:not(:disabled):hover .detail-link": { color: HUD.cyan },
  "&:disabled": { cursor: "default" },
}));

/** 故障卡顶部的红色阻断条 */
const FaultStripe = styled("div")({
  height: 3,
  flexShrink: 0,
  backgroundColor: HUD.danger,
});

const Thumb = styled("div")({
  position: "relative",
  aspectRatio: "16 / 9",
  backgroundColor: "#04090f",
  overflow: "hidden",
  "& > img": {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
});

const ThumbTag = styled("span")<{ $tone: Tone }>(({ $tone }) => ({
  position: "absolute",
  top: 8,
  right: 8,
  padding: "0 7px",
  borderRadius: 4,
  border: `1px solid ${TONE_COLOR[$tone]}40`,
  backgroundColor: "rgba(4, 9, 15, 0.68)",
  color: TONE_COLOR[$tone],
  fontSize: 9.5,
  lineHeight: "15px",
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
}));

const NoThumb = styled("div")({
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  padding: "0 16px",
  textAlign: "center",
  "& > b": { fontSize: 12, fontWeight: 600, color: HUD.textDim },
  "& > span": { fontSize: 10, lineHeight: 1.5, color: HUD.textDim },
});

const CardBody = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "13px 14px 11px",
});

const CardHead = styled("div")({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
});

const DevName = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 1,
  minWidth: 0,
  "& > b": { fontSize: 14.5, fontWeight: 600, color: HUD.text, letterSpacing: 0.2 },
  "& > span": {
    fontSize: 10.5,
    color: HUD.textDim,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
});

const StatusChip = styled("span")<{ $tone: Tone }>(({ $tone }) => {
  const color = TONE_COLOR[$tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "1px 7px",
    borderRadius: 5,
    border: `1px solid ${color}40`,
    backgroundColor: `${color}0f`,
    color,
    fontSize: 10,
    lineHeight: "16px",
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
    flexShrink: 0,
    "&::before": {
      content: '""',
      width: 4,
      height: 4,
      borderRadius: "50%",
      backgroundColor: color,
    },
  };
});

const CardMeta = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 10.5,
  lineHeight: 1.55,
  letterSpacing: 0.2,
  color: HUD.textDim,
  "& b": {
    fontFamily: MONO,
    fontWeight: 500,
    color: HUD.text,
    fontVariantNumeric: "tabular-nums",
  },
});

const FieldBox = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
  "& > span": {
    fontSize: 10.5,
    letterSpacing: 0.2,
    color: HUD.textDim,
    whiteSpace: "nowrap",
  },
  "& > b": {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 500,
    color: HUD.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontVariantNumeric: "tabular-nums",
  },
});

const CardFoot = styled("div")({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginTop: 1,
  paddingTop: 9,
  borderTop: `1px solid ${HUD.lineSoft}`,
  fontSize: 10.5,
  letterSpacing: 0.2,
  color: HUD.textDim,
  "& > .detail-link": {
    marginLeft: "auto",
    color: HUD.textDim,
    whiteSpace: "nowrap",
    transition: "color 160ms ease",
  },
});

/** 电量：电池外框按百分比填充，低于 45% 告警色，低于 10% 红色 */
const Battery = styled("span")({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

const BatteryShell = styled("span")({
  position: "relative",
  display: "inline-block",
  width: 26,
  height: 12,
  padding: 2,
  border: "1px solid rgba(126, 162, 205, 0.42)",
  borderRadius: 2.5,
  "&::after": {
    content: '""',
    position: "absolute",
    top: 3,
    right: -3.5,
    width: 2,
    height: 4,
    borderRadius: "0 1px 1px 0",
    backgroundColor: "rgba(126, 162, 205, 0.42)",
  },
});

const BatteryFill = styled("i")<{ $pct: number }>(({ $pct }) => ({
  display: "block",
  height: "100%",
  width: `${Math.min(Math.max($pct, 4), 100)}%`,
  borderRadius: 1,
  backgroundColor: $pct < 10 ? HUD.danger : $pct < 45 ? HUD.gold : HUD.ok,
  opacity: 0.85,
  transition: "width 200ms ease, background-color 160ms ease",
}));

function BatteryMeter({ level }: { level: number | null }) {
  if (level === null) {
    return <Battery style={{ color: HUD.textDim }}>--</Battery>;
  }
  const textColor = level < 10 ? HUD.danger : level < 45 ? HUD.gold : HUD.text;
  return (
    <Battery aria-label={`电量 ${level}%`}>
      <BatteryShell>
        <BatteryFill $pct={level} />
      </BatteryShell>
      <span style={{ color: textColor }}>{level}%</span>
    </Battery>
  );
}

function Field({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <FieldBox>
      <span>{label}</span>
      <b
        style={tone ? { color: TONE_COLOR[tone] } : undefined}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </b>
    </FieldBox>
  );
}

function StatusChipView({ phase }: { phase: Phase }) {
  const meta = PHASE_META[phase];
  return <StatusChip $tone={meta.tone}>{meta.label}</StatusChip>;
}

/* ---------- 单台详情 ---------- */

const BackBtn = styled("button")({
  height: 26,
  padding: "0 4px",
  border: "none",
  background: "transparent",
  color: HUD.textDim,
  fontSize: 11,
  letterSpacing: 0.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "color 140ms ease",
  "&:hover": { color: HUD.cyan },
});

const DetailHead = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  paddingBottom: 2,
});

const HeadStatus = styled("div")({
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
});

const DetailTitle = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
  "& h2": {
    display: "flex",
    alignItems: "baseline",
    gap: 9,
    margin: 0,
    fontSize: 21,
    fontWeight: 600,
    letterSpacing: 0.3,
    color: HUD.text,
    "& span": { fontSize: 11.5, fontWeight: 400, color: HUD.textDim, letterSpacing: 0.4 },
  },
});

const DetailGrid = styled("div")({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 0.38fr)",
  gridTemplateAreas: '"video right" "sessions right"',
  gap: 12,
  alignItems: "start",
  "@media (max-width: 820px)": {
    gridTemplateColumns: "1fr",
    gridTemplateAreas: '"video" "sessions" "right"',
  },
});

/** 设备状态条：电量 / 网络 / 待上传 / 待复核 */
const StatusStrip = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
  overflow: "hidden",
  "@media (max-width: 760px)": {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
}));

const StripCell = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 5,
  padding: "11px 15px",
  minWidth: 0,
  "& > .label": {
    fontSize: 10.5,
    letterSpacing: 0.3,
    color: HUD.textDim,
    whiteSpace: "nowrap",
  },
  "& > b": {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 500,
    color: HUD.text,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  "&:not(:first-of-type)": { borderLeft: `1px solid ${HUD.lineSoft}` },
  "@media (max-width: 760px)": {
    "&:nth-of-type(odd)": { borderLeft: "none" },
    "&:nth-of-type(n+3)": { borderTop: `1px solid ${HUD.lineSoft}` },
  },
});

const Panel = styled("section")<{ $area: "video" | "right" | "sessions" }>(({ theme, $area }) => ({
  gridArea: $area,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
  overflow: "hidden",
}));

const VideoBar = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 13px",
  borderBottom: `1px solid ${HUD.lineSoft}`,
  flexWrap: "wrap",
  "& > .title": { fontSize: 12.5, fontWeight: 600, letterSpacing: 0.4, color: HUD.text },
});

const ChannelSwitch = styled("div")({
  display: "flex",
  border: `1px solid ${HUD.lineSoft}`,
  borderRadius: 5,
  overflow: "hidden",
  "& button": {
    height: 25,
    padding: "0 11px",
    border: "none",
    background: "transparent",
    color: HUD.textDim,
    fontSize: 11,
    letterSpacing: 0.4,
    cursor: "pointer",
    transition: "background-color 160ms ease, color 160ms ease",
    "& + button": { borderLeft: `1px solid ${HUD.lineSoft}` },
    "&.is-active": { backgroundColor: "rgba(63, 178, 255, 0.14)", color: HUD.cyan },
    "&:disabled": { opacity: 0.4, cursor: "default" },
  },
});

const VideoStage = styled("div")({
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  maxHeight: 400,
  backgroundColor: "#04090f",
  overflow: "hidden",
  "& > img": {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
});

const VideoOverlay = styled("div")({
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  textAlign: "center",
  backgroundColor: "rgba(3, 7, 15, 0.5)",
  "& > b": { fontSize: 14, letterSpacing: 1, color: HUD.gold },
  "& > span": { fontSize: 11, letterSpacing: 0.4, color: HUD.text },
});

const NoPreview = styled("div")({
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "0 20px",
  textAlign: "center",
  "& > b": { fontSize: 14, color: HUD.textDim },
  "& > span": { fontSize: 11, lineHeight: 1.6, color: HUD.textDim, maxWidth: 320 },
});

const ChannelTag = styled("span")({
  position: "absolute",
  top: 9,
  left: 10,
  padding: "0 7px",
  borderRadius: 4,
  border: `1px solid ${HUD.lineSoft}`,
  backgroundColor: "rgba(4, 9, 15, 0.68)",
  color: HUD.textDim,
  fontSize: 9.5,
  lineHeight: "16px",
  letterSpacing: 0.5,
});

const VideoFoot = styled("div")({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 13px 9px",
  borderTop: `1px solid ${HUD.lineSoft}`,
  fontSize: 10.5,
  letterSpacing: 0.2,
  color: HUD.textDim,
  "& > b": {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 500,
    color: HUD.text,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
});

const InfoHead = styled("div")({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "9px 13px",
  borderBottom: `1px solid ${HUD.lineSoft}`,
  "& > h3": { margin: 0, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.4, color: HUD.text },
  "& > span": {
    fontSize: 10.5,
    letterSpacing: 0.3,
    color: HUD.textDim,
    whiteSpace: "nowrap",
  },
});

const InfoGrid = styled("div")({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px 12px",
});

const Notice = styled("div")<{ $tone: Tone }>(({ $tone }) => ({
  padding: "9px 11px",
  borderRadius: 6,
  border: `1px solid ${TONE_COLOR[$tone]}38`,
  backgroundColor: `${TONE_COLOR[$tone]}0d`,
  fontSize: 11,
  lineHeight: 1.7,
  color: HUD.text,
  "& b": { marginRight: 6, fontWeight: 600, color: TONE_COLOR[$tone] },
}));

const SideBody = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 0,
  padding: "13px 13px 15px",
  minHeight: 0,
});

const PanelBottom = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 11,
  paddingTop: 12,
  borderTop: `1px solid ${HUD.lineSoft}`,
});

const EventsBlock = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 0,
});

const EventsHead = styled("span")({
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: 0.3,
  color: HUD.text,
});

const EventList = styled("div")({
  display: "flex",
  flexDirection: "column",
});

const EventRow = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr) auto",
  alignItems: "baseline",
  gap: 10,
  padding: "6px 0",
  "& + &": { borderTop: `1px solid ${theme.palette.divider}` },
}));

const EventTime = styled("span")({
  fontFamily: MONO,
  fontSize: 10.5,
  color: HUD.textDim,
  fontVariantNumeric: "tabular-nums",
});

const EventAction = styled("span")({
  fontSize: 12.5,
  letterSpacing: 0.3,
  color: HUD.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const EventResult = styled("span")<{ $tone: Tone }>(({ $tone }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 10.5,
  letterSpacing: 0.4,
  color: TONE_COLOR[$tone],
  whiteSpace: "nowrap",
  "&::before": {
    content: '""',
    width: 4,
    height: 4,
    borderRadius: "50%",
    backgroundColor: TONE_COLOR[$tone],
  },
}));

const EventEmpty = styled("span")({
  fontSize: 10.5,
  letterSpacing: 0.3,
  color: HUD.textDim,
});

/** 分类信号清单：默认收起，点标题行展开 */
const SignalGroups = styled("div")({
  marginTop: 13,
  borderTop: `1px solid ${HUD.lineSoft}`,
});

const SignalGroup = styled("div")({
  "& + &": { borderTop: `1px solid ${HUD.lineSoft}` },
});

const SignalHead = styled("button")({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  padding: "8px 0",
  border: "none",
  background: "transparent",
  color: HUD.text,
  fontFamily: "inherit",
  fontSize: 11.5,
  fontWeight: 500,
  letterSpacing: 0.3,
  cursor: "pointer",
  transition: "color 160ms ease",
  "&:hover": { color: HUD.cyan },
  "&:focus-visible": {
    outline: `1px solid ${HUD.cyan}`,
    outlineOffset: 2,
    borderRadius: 3,
  },
});

const SignalTri = styled("span")<{ $open: boolean }>(({ $open }) => ({
  width: 0,
  height: 0,
  borderLeft: "4px solid transparent",
  borderRight: "4px solid transparent",
  borderTop: `5px solid ${HUD.textDim}`,
  transform: `rotate(${$open ? 180 : 0}deg)`,
  transition: "transform 160ms ease",
  flexShrink: 0,
}));

const SignalList = styled("div")({
  display: "flex",
  flexDirection: "column",
  padding: "0 0 7px",
});

const SignalRow = styled("div")({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  padding: "3px 0",
  fontSize: 11,
  "& > span": { color: HUD.textDim, letterSpacing: 0.2 },
  "& > b": {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 500,
    color: HUD.text,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
  },
});

const SessionTable = styled("table")(({ theme }) => ({
  width: "100%",
  borderCollapse: "collapse",
  fontVariantNumeric: "tabular-nums",
  "& th": {
    padding: "7px 13px 6px",
    textAlign: "left",
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: 0.4,
    color: HUD.textDim,
    borderBottom: `1px solid ${theme.palette.divider}`,
    whiteSpace: "nowrap",
  },
  "& td": {
    padding: "9px 13px",
    fontSize: 11.5,
    letterSpacing: 0.3,
    color: HUD.text,
    borderBottom: `1px solid ${HUD.lineSoft}`,
    whiteSpace: "nowrap",
  },
  "& tbody tr:last-of-type td": { borderBottom: "none" },
  "& td.mono": { fontFamily: MONO, fontSize: 11, letterSpacing: 0.2 },
  "& td.num": { fontFamily: MONO, fontSize: 12, letterSpacing: 0.2 },
}));

const SessionEmpty = styled("span")({
  padding: "10px 13px 12px",
  fontSize: 10.5,
  letterSpacing: 0.3,
  color: HUD.textDim,
});

/* ---------- 页面 ---------- */

export default function DevicePage() {
  const { notify } = useNotification();
  const [devices, setDevices] = useState<ManagedDevice[]>(INITIAL_DEVICES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("left");
  const [refreshing, setRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(() => clock());
  /** 单路详情信号类别的展开状态；默认全部收起 */
  const [openSignals, setOpenSignals] = useState<Record<string, boolean>>({});
  const refreshTimer = useRef<number | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
    setOpenSignals({});
  }, [selectedId]);

  useEffect(
    () => () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  const counts = useMemo(
    () => ({
      running: devices.filter((d) => d.phase === "running").length,
      online: devices.filter((d) => d.phase === "online").length,
      offline: devices.filter((d) => d.phase === "offline").length,
      fault: devices.filter((d) => d.phase === "fault").length,
    }),
    [devices],
  );

  const selected = devices.find((d) => d.id === selectedId) ?? null;

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    refreshTimer.current = window.setTimeout(() => {
      setSyncedAt(clock());
      setDevices((prev) =>
        prev.map((d) =>
          d.phase === "running" || d.phase === "online"
            ? { ...d, heartbeatAgo: "刚刚", videoAt: "刚刚" }
            : d,
        ),
      );
      setRefreshing(false);
      notify("设备状态已刷新", "success");
    }, 600);
  };

  if (selected) {
    const canPreview = selected.phase === "running";
    const stale = selected.phase === "offline";

    return (
      <Page ref={pageRef}>
        <Shell>
          <DetailHead>
            <BackBtn type="button" onClick={() => setSelectedId(null)}>
              ← 返回
            </BackBtn>
            <DetailTitle>
              <h2>
                {selected.id}
                <span>{selected.alias}</span>
              </h2>
            </DetailTitle>
            <HeadStatus>
              <StatusChipView phase={selected.phase} />
            </HeadStatus>
          </DetailHead>

          <StatusStrip>
            <StripCell>
              <span className="label">电量</span>
              <b>
                <BatteryMeter level={selected.battery} />
              </b>
            </StripCell>
            <StripCell>
              <span className="label">Wi-Fi 信号</span>
              <b>{wifiText(selected.rssi)}</b>
            </StripCell>
            <StripCell>
              <span className="label">待上传</span>
              <b>{selected.pendingFiles} 个</b>
            </StripCell>
            <StripCell>
              <span className="label">待复核</span>
              <b>{selected.reviewPending} 条</b>
            </StripCell>
          </StatusStrip>

          <DetailGrid>
            <Panel $area="video">
              <VideoBar>
                <span className="title">单路预览</span>
                <ChannelSwitch>
                  <button
                    type="button"
                    className={channel === "left" ? "is-active" : undefined}
                    onClick={() => setChannel("left")}
                    disabled={!canPreview}
                  >
                    左目
                  </button>
                  <button
                    type="button"
                    className={channel === "right" ? "is-active" : undefined}
                    onClick={() => setChannel("right")}
                    disabled={!canPreview}
                  >
                    右目
                  </button>
                  <button
                    type="button"
                    className={channel === "effect" ? "is-active" : undefined}
                    onClick={() => setChannel("effect")}
                    disabled={!canPreview}
                  >
                    手部图
                  </button>
                </ChannelSwitch>
              </VideoBar>
              <VideoStage>
                {canPreview ? (
                  <>
                    <img
                      src={channel === "effect" ? "/modules/effect-hand.png" : "/modules/main.png"}
                      alt={`${selected.id} ${CHANNEL_LABEL[channel]}预览`}
                      draggable={false}
                      style={{
                        objectFit: channel === "effect" ? "contain" : "cover",
                        transform:
                          channel === "effect"
                            ? "none"
                            : `scale(1.06) translateX(${channel === "left" ? "-2.2%" : "2.2%"})`,
                        filter: stale
                          ? "grayscale(0.5) brightness(0.55)"
                          : "saturate(1.05) contrast(1.04)",
                      }}
                    />
                    <ChannelTag>
                      {CHANNEL_LABEL[channel]} · 演示画面
                    </ChannelTag>
                    {stale && (
                      <VideoOverlay>
                        <b>已断开 · 非实时</b>
                        <span>最后帧 {selected.videoAt}</span>
                      </VideoOverlay>
                    )}
                  </>
                ) : (
                  <NoPreview>
                    <b>
                      {selected.phase === "fault"
                        ? "故障 · 无可用画面"
                        : selected.phase === "offline"
                          ? "离线 · 无可用画面"
                          : "空闲 · 无实时画面"}
                    </b>
                    <span>
                      {selected.phase === "fault"
                        ? selected.fault
                        : selected.phase === "offline"
                          ? `最后帧 ${selected.videoAt}`
                          : "设备在线，但当前未执行任务"}
                    </span>
                  </NoPreview>
                )}
              </VideoStage>
              <VideoFoot>
                <span>低频截帧</span>
                <b>{canPreview ? `帧 ${selected.videoAt}` : "无可用帧"}</b>
              </VideoFoot>
            </Panel>

            <Panel $area="sessions">
              <InfoHead>
                <h3>最近任务记录</h3>
                <span>最近 3 次任务</span>
              </InfoHead>
              {selected.sessions.length > 0 ? (
                <SessionTable>
                  <thead>
                    <tr>
                      <th>任务名称</th>
                      <th>负责人</th>
                      <th>开始</th>
                      <th>事件</th>
                      <th>评分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.sessions.slice(0, 3).map((s) => (
                      <tr key={s.name}>
                        <td className="mono">{s.name}</td>
                        <td>{s.operator}</td>
                        <td>{s.start}</td>
                        <td className="num">{s.events}</td>
                        <td className="num">{s.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </SessionTable>
              ) : (
                <SessionEmpty>暂无任务记录</SessionEmpty>
              )}
            </Panel>

            <Panel $area="right">
              <InfoHead>
                <h3>设备明细</h3>
              </InfoHead>
              <SideBody>
                <InfoGrid>
                  <Field label="配对状态" value={selected.paired ? "已配对" : "未配对"} />
                  <Field label="任务状态" value={selected.task} />
                  <Field
                    label="最后心跳"
                    value={heartbeatText(selected)}
                    tone={stale ? "gold" : undefined}
                  />
                  <Field
                    label="视频更新"
                    value={selected.videoAt}
                    tone={stale ? "gold" : undefined}
                  />
                </InfoGrid>

                <SignalGroups>
                  {signalGroupsFor(selected).map((group) => {
                    const open = Boolean(openSignals[group.key]);
                    return (
                      <SignalGroup key={group.key}>
                        <SignalHead
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setOpenSignals((prev) => ({
                              ...prev,
                              [group.key]: !prev[group.key],
                            }))
                          }
                        >
                          <span>{group.label}</span>
                          <SignalTri $open={open} />
                        </SignalHead>
                        {open && (
                          <SignalList>
                            {group.items.map((item) => (
                              <SignalRow key={item.label}>
                                <span>{item.label}</span>
                                <b
                                  style={
                                    item.tone ? { color: TONE_COLOR[item.tone] } : undefined
                                  }
                                >
                                  {item.value}
                                </b>
                              </SignalRow>
                            ))}
                          </SignalList>
                        )}
                      </SignalGroup>
                    );
                  })}
                </SignalGroups>

                <PanelBottom>
                  <EventsBlock>
                    <EventsHead>最近事件</EventsHead>
                    {selected.recentEvents.length > 0 ? (
                      <EventList>
                        {selected.recentEvents.map((e) => (
                          <EventRow key={`${e.at}-${e.action}`}>
                            <EventTime>{e.at}</EventTime>
                            <EventAction>{e.action}</EventAction>
                            <EventResult $tone={e.tone}>{e.result}</EventResult>
                          </EventRow>
                        ))}
                      </EventList>
                    ) : (
                      <EventEmpty>
                        {selected.phase === "running"
                          ? "暂无事件记录"
                          : "停机后无新增事件"}
                      </EventEmpty>
                    )}
                  </EventsBlock>

                  {selected.phase === "offline" && (
                    <Notice $tone="gold">
                      <b>非实时</b>
                      设备已离线，画面与数值为最后一次上报。
                    </Notice>
                  )}
                  {selected.phase === "fault" && (
                    <Notice $tone="danger">
                      <b>故障</b>
                      {selected.fault}；重连后不会重复产生事件。
                    </Notice>
                  )}
                </PanelBottom>
              </SideBody>
            </Panel>
          </DetailGrid>
        </Shell>
      </Page>
    );
  }

  return (
    <Page ref={pageRef}>
      <Shell>
        <PageHead>
          <div>
            <h1>设备总览</h1>
            <p>
              当前现场管理入口 <b>http://192.168.31.20:8080</b> · iPad 现场管理服务 ·
              局域网已连接 · 最近同步 {syncedAt}
            </p>
          </div>
          <Actions>
            <ActionBtn type="button" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? "刷新中…" : "刷新设备"}
            </ActionBtn>
          </Actions>
        </PageHead>

        <SummaryRow>
          <CountChip $tone="ok">
            <b>{counts.running}</b> 运行中
          </CountChip>
          <CountChip $tone="cyan">
            <b>{counts.online}</b> 在线
          </CountChip>
          <CountChip $tone="dim">
            <b>{counts.offline}</b> 离线
          </CountChip>
          <CountChip $tone="danger">
            <b>{counts.fault}</b> 故障
          </CountChip>
          <SummaryHint>
            V1 试验规模 4 台 · 仅运行中设备可点进单台详情
          </SummaryHint>
        </SummaryRow>

        <Grid>
          {devices.map((d) => {
            const meta = PHASE_META[d.phase];
            const enterable = d.phase === "running";
            const wifi = d.rssi === null ? "--" : `${d.rssi} dBm`;
            const pendingText =
              d.pendingSize === "0"
                ? "待上传 0"
                : `待上传 ${d.pendingFiles} · ${d.pendingSize}`;
            return (
              <DeviceCard
                key={d.id}
                type="button"
                $phase={d.phase}
                disabled={!enterable}
                aria-label={
                  enterable
                    ? `查看 ${d.id} 详情`
                    : `${d.id} ${meta.label}，不可进入单台详情`
                }
                onClick={
                  enterable
                    ? () => {
                        setChannel("left");
                        setSelectedId(d.id);
                      }
                    : undefined
                }
              >
                {d.phase === "fault" && <FaultStripe />}
                <Thumb>
                  {d.phase === "offline" ? (
                    <NoThumb>
                      <b>无信号</b>
                    </NoThumb>
                  ) : (
                    <>
                      <img
                        src="/modules/main.png"
                        alt={`${d.id} 低频预览`}
                        draggable={false}
                        style={{
                          filter:
                            d.phase === "fault"
                              ? "grayscale(0.7) brightness(0.55)"
                              : "none",
                        }}
                      />
                      <ThumbTag $tone={d.phase === "running" ? "ok" : "dim"}>
                        {d.phase === "running" ? "低频预览 ≤2fps" : "低频预览"}
                      </ThumbTag>
                    </>
                  )}
                </Thumb>

                <CardBody>
                  <CardHead>
                    <DevName>
                      <b>{d.id}</b>
                      <span>
                        {d.phase === "running"
                          ? d.alias
                          : d.phase === "online"
                            ? "暂无任务"
                            : "无位置"}
                      </span>
                    </DevName>
                    <StatusChipView phase={d.phase} />
                  </CardHead>

                  <CardMeta>
                    {d.phase === "offline" ? (
                      <>
                        <span>最后心跳 {d.heartbeatAgo}</span>
                        <span>离线时刻 {d.heartbeatAt}</span>
                        <span>{pendingText}</span>
                      </>
                    ) : d.phase === "fault" ? (
                      <>
                        <span style={{ color: TONE_COLOR.danger }}>{d.fault}</span>
                        <span>相机末帧 {d.videoAt}（超阈值）</span>
                        <span>{pendingText}</span>
                      </>
                    ) : (
                      <>
                        <span>
                          心跳 {d.heartbeatAgo} · 电量 <BatteryMeter level={d.battery} />
                        </span>
                        <span>
                          Wi-Fi {wifi} ·{" "}
                          {d.score !== null
                            ? `评分 ${d.score}`
                            : d.phase === "online"
                              ? "空闲"
                              : "暂无任务"}
                        </span>
                        <span>{pendingText}</span>
                      </>
                    )}
                  </CardMeta>

                  <CardFoot>
                    <span>
                      {d.phase === "offline" && d.heartbeatAt === "--"
                        ? "尚未上线 · 等待首次心跳"
                        : meta.hint}
                    </span>
                    {enterable && <span className="detail-link">单台详情 ›</span>}
                  </CardFoot>
                </CardBody>
              </DeviceCard>
            );
          })}
        </Grid>
      </Shell>
    </Page>
  );
}