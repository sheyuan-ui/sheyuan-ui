import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { useNotification } from "../../contexts/NotificationContext";

type Phase = "online" | "unreachable" | "pending" | "fault";
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
  online: { label: "在线", tone: "ok", hint: "画面与数据实时" },
  unreachable: { label: "局域网不可达", tone: "gold", hint: "最后数据保留 · 非实时" },
  pending: { label: "待配对", tone: "cyan", hint: "配对后可见画面与数据" },
  fault: { label: "异常", tone: "danger", hint: "故障停机 · 最后数据保留" },
};

interface RecentEvent {
  at: string;
  action: string;
  result: string;
  tone: Tone;
}

interface ManagedDevice {
  id: string;
  alias: string;
  paired: boolean;
  phase: Phase;
  battery: number | null;
  /** Wi-Fi 信号强度，dBm */
  rssi: number | null;
  heartbeatAgo: string;
  /** 最后一次心跳的绝对时间；当前在线时留空 */
  heartbeatAt: string;
  task: string;
  reviewPending: number;
  videoAt: string;
  pending: number;
  recentEvents: RecentEvent[];
  fault?: string;
}

const INITIAL_DEVICES: ManagedDevice[] = [
  {
    id: "头盔-01",
    alias: "1号抓鸡位",
    paired: true,
    phase: "online",
    battery: 78,
    rssi: -48,
    heartbeatAgo: "刚刚",
    heartbeatAt: "",
    task: "运行中",
    reviewPending: 2,
    videoAt: "2 秒前",
    pending: 3,
    recentEvents: [
      { at: "10:41:07", action: "抓取", result: "合规", tone: "ok" },
      { at: "10:40:52", action: "转移", result: "待复核", tone: "gold" },
      { at: "10:39:31", action: "抓取", result: "不可评估", tone: "dim" },
    ],
  },
  {
    id: "头盔-02",
    alias: "2号抓鸡位",
    paired: true,
    phase: "unreachable",
    battery: 64,
    rssi: -61,
    heartbeatAgo: "4 分钟前",
    heartbeatAt: "10:42:21",
    task: "运行中",
    reviewPending: 1,
    videoAt: "10:42:19",
    pending: 5,
    recentEvents: [
      { at: "10:42:11", action: "抓取", result: "合规", tone: "ok" },
      { at: "10:41:56", action: "提起", result: "待复核", tone: "gold" },
      { at: "10:41:30", action: "接近", result: "不可评估", tone: "dim" },
    ],
  },
  {
    id: "头盔-03",
    alias: "3号抓鸡位",
    paired: false,
    phase: "pending",
    battery: 8,
    rssi: -70,
    heartbeatAgo: "12 分钟前",
    heartbeatAt: "10:34:08",
    task: "待配对",
    reviewPending: 0,
    videoAt: "配对后可预览",
    pending: 0,
    recentEvents: [],
  },
  {
    id: "头盔-04",
    alias: "4号抓鸡位",
    paired: false,
    phase: "fault",
    battery: 41,
    rssi: -58,
    heartbeatAgo: "刚刚",
    heartbeatAt: "",
    task: "故障停机",
    reviewPending: 0,
    videoAt: "10:39:02",
    pending: 7,
    recentEvents: [],
    fault: "相机断开 · 左目未检测到画面",
  },
];

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

const DeviceCard = styled("button")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  padding: 0,
  textAlign: "left",
  font: "inherit",
  color: HUD.text,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
  overflow: "hidden",
  cursor: "pointer",
  transition: "border-color 180ms ease, background-color 180ms ease",
  "&:hover": {
    borderColor: "rgba(96, 176, 255, 0.32)",
    backgroundColor: HUD.panelSoft,
  },
  "&:hover .detail-link": { color: HUD.cyan },
}));

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

const ThumbOverlay = styled("div")({
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  padding: "14px 10px 7px",
  fontSize: 10,
  letterSpacing: 0.3,
  color: HUD.text,
  background: "linear-gradient(0deg, rgba(3, 7, 15, 0.94), rgba(3, 7, 15, 0))",
});

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

const MetaGrid = styled("div")({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "7px 10px",
  minWidth: 0,
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
  gridTemplateAreas: '"video right"',
  gap: 12,
  alignItems: "start",
  "@media (max-width: 820px)": {
    gridTemplateColumns: "1fr",
    gridTemplateAreas: '"video" "right"',
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

const Panel = styled("section")<{ $area: "video" | "right" }>(({ theme, $area }) => ({
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

/* ---------- 通过设备码添加 ---------- */

const Backdrop = styled("div")({
  position: "fixed",
  inset: 0,
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  backgroundColor: "rgba(2, 5, 10, 0.72)",
  backdropFilter: "blur(2px)",
});

const Dialog = styled("form")({
  width: 420,
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 11,
  padding: "18px 18px 16px",
  borderRadius: 8,
  border: `1px solid ${HUD.line}`,
  backgroundColor: HUD.panelSoft,
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
  "& h3": { margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: 0.5, color: HUD.text },
  "& p": { margin: 0, fontSize: 12, lineHeight: 1.65, color: HUD.textDim },
});

const CodeInput = styled("input")({
  height: 38,
  padding: "0 11px",
  borderRadius: 4,
  border: `1px solid ${HUD.line}`,
  background: "rgba(4, 9, 15, 0.85)",
  color: HUD.text,
  fontFamily: MONO,
  fontSize: 14,
  letterSpacing: 2,
  outline: "none",
  textTransform: "uppercase",
  "&:focus": { borderColor: HUD.lineStrong },
  "&::placeholder": { color: HUD.textDim, fontSize: 11, letterSpacing: 0.5 },
});

const ErrorText = styled("span")({
  fontSize: 11,
  color: HUD.danger,
});

const ScaleHint = styled("span")({
  fontSize: 10,
  letterSpacing: 0.3,
  color: HUD.textDim,
});

const DialogActions = styled("div")({
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 2,
});

/* ---------- 页面 ---------- */

export default function DevicePage() {
  const { notify } = useNotification();
  const [devices, setDevices] = useState<ManagedDevice[]>(INITIAL_DEVICES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [channel, setChannel] = useState<"left" | "right">("left");
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(() => clock());
  const refreshTimer = useRef<number | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  useEffect(
    () => () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  const counts = useMemo(
    () => ({
      online: devices.filter((d) => d.phase === "online").length,
      unreachable: devices.filter((d) => d.phase === "unreachable").length,
      pending: devices.filter((d) => d.phase === "pending").length,
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
          d.phase === "online" ? { ...d, heartbeatAgo: "刚刚", videoAt: "刚刚" } : d,
        ),
      );
      setRefreshing(false);
      notify("设备状态已刷新", "success");
    }, 600);
  };

  const submitAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{5,}$/.test(value)) {
      setCodeError("请输入至少 6 位字母、数字或连字符组成的设备码");
      return;
    }
    const maxNo = devices.reduce((max, d) => {
      const no = Number(d.id.split("-").pop());
      return Number.isFinite(no) ? Math.max(max, no) : max;
    }, 0);
    const id = `头盔-${String(maxNo + 1).padStart(2, "0")}`;
    setDevices((prev) => [
      ...prev,
      {
        id,
        alias: `设备码 ${value}`,
        paired: false,
        phase: "pending",
        battery: null,
        rssi: null,
        heartbeatAgo: "刚刚",
        heartbeatAt: "",
        task: "待配对",
        reviewPending: 0,
        videoAt: "配对后可预览",
        pending: 0,
        recentEvents: [],
      },
    ]);
    setAddOpen(false);
    setCode("");
    setCodeError("");
    notify(`${id} 已加入，等待配对`, "success");
  };

  if (selected) {
    const canPreview = selected.phase === "online" || selected.phase === "unreachable";
    const stale = selected.phase === "unreachable";

    return (
      <Page ref={pageRef}>
        <Shell>
          <DetailHead>
            <BackBtn type="button" onClick={() => setSelectedId(null)}>
              ← 返回设备总览
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
              <b>{selected.pending} 个</b>
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
                </ChannelSwitch>
              </VideoBar>
              <VideoStage>
                {canPreview ? (
                  <>
                    <img
                      src="/modules/main.png"
                      alt={`${selected.id} ${channel === "left" ? "左目" : "右目"}预览`}
                      draggable={false}
                      style={{
                        transform:
                          channel === "left"
                            ? "scale(1.06) translateX(-2.2%)"
                            : "scale(1.06) translateX(2.2%)",
                        filter: stale
                          ? "grayscale(0.5) brightness(0.55)"
                          : "saturate(1.05) contrast(1.04)",
                      }}
                    />
                    <ChannelTag>
                      {channel === "left" ? "左目" : "右目"} · 演示画面
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
                      {selected.phase === "fault" ? "异常 · 无可用画面" : "设备未配对"}
                    </b>
                    <span>
                      {selected.phase === "fault"
                        ? selected.fault
                        : "确认配对后显示单路预览"}
                    </span>
                  </NoPreview>
                )}
              </VideoStage>
              <VideoFoot>
                <span>低频截帧</span>
                <b>{canPreview ? `帧 ${selected.videoAt}` : "无可用帧"}</b>
              </VideoFoot>
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
                        {selected.phase === "pending"
                          ? "配对后可查看该设备事件"
                          : "异常停机后无新增事件"}
                      </EventEmpty>
                    )}
                  </EventsBlock>

                  {selected.phase === "unreachable" && (
                    <Notice $tone="gold">
                      <b>非实时</b>
                      局域网不可达，画面与数值为最后一次上报。
                    </Notice>
                  )}
                  {selected.phase === "fault" && (
                    <Notice $tone="danger">
                      <b>异常</b>
                      {selected.fault}；重连后不会重复产生事件。
                    </Notice>
                  )}
                  {selected.phase === "pending" && (
                    <Notice $tone="cyan">
                      <b>待配对</b>
                      确认配对后才能查看画面并接收任务指令。
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
            <ActionBtn type="button" $primary onClick={() => setAddOpen(true)}>
              通过设备码添加
            </ActionBtn>
          </Actions>
        </PageHead>

        <SummaryRow>
          <CountChip $tone="ok">
            <b>{counts.online}</b> 在线
          </CountChip>
          <CountChip $tone="gold">
            <b>{counts.unreachable}</b> 局域网不可达
          </CountChip>
          <CountChip $tone="cyan">
            <b>{counts.pending}</b> 待配对
          </CountChip>
          <CountChip $tone="danger">
            <b>{counts.fault}</b> 异常
          </CountChip>
          <SummaryHint>
            V1 试验规模 4 台 · 点选设备查看单路视频
          </SummaryHint>
        </SummaryRow>

        <Grid>
          {devices.map((d) => {
            const meta = PHASE_META[d.phase];
            const stale = d.phase === "unreachable";
            const previewable = d.phase === "online" || stale;
            return (
              <DeviceCard
                key={d.id}
                type="button"
                aria-label={`查看 ${d.id} 详情`}
                onClick={() => {
                  setChannel("left");
                  setSelectedId(d.id);
                }}
              >
                <Thumb>
                  {previewable ? (
                    <>
                      <img
                        src="/modules/main.png"
                        alt={`${d.id} 低频预览`}
                        draggable={false}
                        style={{
                          filter: stale ? "grayscale(0.5) brightness(0.55)" : "none",
                        }}
                      />
                      <ThumbTag $tone={stale ? "gold" : "dim"}>
                        {stale ? "非实时" : "低频预览"}
                      </ThumbTag>
                      {stale && <ThumbOverlay>已断开 · 最后帧 {d.videoAt}</ThumbOverlay>}
                    </>
                  ) : (
                    <>
                      <NoThumb>
                        <b>{d.phase === "fault" ? "异常 · 无可用画面" : "未配对 · 无画面"}</b>
                        <span>
                          {d.phase === "fault" ? d.fault : "确认配对后可查看单路预览"}
                        </span>
                      </NoThumb>
                      {d.phase === "fault" && (
                        <ThumbTag $tone="danger">最后帧 {d.videoAt}</ThumbTag>
                      )}
                    </>
                  )}
                </Thumb>

                <CardBody>
                  <CardHead>
                    <DevName>
                      <b>{d.id}</b>
                      <span>{d.alias}</span>
                    </DevName>
                    <StatusChipView phase={d.phase} />
                  </CardHead>

                  <MetaGrid>
                    <Field label="配对" value={d.paired ? "已配对" : "未配对"} />
                    <Field
                      label="最后心跳"
                      value={d.heartbeatAgo}
                      tone={stale ? "gold" : undefined}
                    />
                    <Field
                      label="电量"
                      value={<BatteryMeter level={d.battery} />}
                    />
                    <Field label="Wi-Fi" value={wifiText(d.rssi)} />
                    <Field label="任务" value={d.task} />
                    <Field
                      label="视频更新"
                      value={d.videoAt}
                      tone={stale ? "gold" : undefined}
                    />
                    <Field label="待上传" value={`${d.pending} 个`} />
                  </MetaGrid>

                  <CardFoot>
                    {d.phase !== "online" && <span>{meta.hint}</span>}
                    <span className="detail-link">单台详情 ›</span>
                  </CardFoot>
                </CardBody>
              </DeviceCard>
            );
          })}
        </Grid>
      </Shell>

      {addOpen && (
        <Backdrop onMouseDown={() => setAddOpen(false)}>
          <Dialog onSubmit={submitAdd} onMouseDown={(e) => e.stopPropagation()}>
            <h3>通过设备码添加</h3>
            <p>
              输入头盔背面标签上的设备码。添加后显示为「待配对」，确认配对后才能查看画面并接收任务指令。
            </p>
            <CodeInput
              autoFocus
              value={code}
              maxLength={20}
              aria-label="设备码"
              placeholder="设备码，如 SH-01-4F2A"
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError("");
              }}
            />
            {codeError && <ErrorText>{codeError}</ErrorText>}
            <ScaleHint>
              当前 {devices.length} 台；V1 试验规模 4 台，设备数上限按实测确定。
            </ScaleHint>
            <DialogActions>
              <ActionBtn type="button" onClick={() => setAddOpen(false)}>
                取消
              </ActionBtn>
              <ActionBtn type="submit" $primary>
                添加设备
              </ActionBtn>
            </DialogActions>
          </Dialog>
        </Backdrop>
      )}
    </Page>
  );
}