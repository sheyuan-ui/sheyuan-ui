import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import {
  formatAnnotationTime,
  usePlayback,
  type ActionAnnotation,
} from "../../contexts/PlaybackContext";

const Bar = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  height: "100%",
  width: "100%",
  padding: "8px 12px",
  backgroundColor: theme.palette.background.paper,
  borderTop: `1px solid ${theme.palette.divider}`,
  userSelect: "none",
  minWidth: 0,
}));

/** 第一行：动作标注 + 任务名，右侧时间码 */
const HeaderRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 12,
  height: 26,
  flexShrink: 0,
});

const HeaderTitle = styled("div")({
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 2,
  color: HUD.textDim,
  "&::before": {
    content: '"▸"',
    color: HUD.cyan,
    marginRight: 6,
  },
});

const TaskName = styled("span")({
  fontSize: 13,
  letterSpacing: 1,
  color: HUD.textDim,
});

const TimeBlock = styled("div")({
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: 12,
});

const PlayButton = styled("button")({
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  padding: 0,
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: HUD.cyan,
  cursor: "pointer",
  transition: "background-color 140ms ease, color 140ms ease",
  "&:hover": {
    backgroundColor: "rgba(63, 178, 255, 0.12)",
  },
  "&:focus-visible": {
    outline: `1px solid ${HUD.cyan}`,
    outlineOffset: 1,
  },
});

const TimeCode = styled("div")({
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
  color: HUD.cyan,
  letterSpacing: 1,
});

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3.2 1.6v8.8L10 6z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="2.6" y="1.8" width="2.4" height="8.4" rx="0.6" />
      <rect x="7" y="1.8" width="2.4" height="8.4" rx="0.6" />
    </svg>
  );
}

/** 第二行：左右手标注卡 */
const CardsRow = styled("div")({
  display: "flex",
  gap: 10,
  flex: 1,
  minWidth: 0,
  minHeight: 0,
});

const HandCard = styled("div")<{ $active: boolean }>(({ $active }) => ({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  padding: "6px 12px",
  cursor: "pointer",
  borderLeft: `2px solid ${$active ? HUD.orange : HUD.line}`,
  backgroundColor: $active ? "rgba(239, 131, 58, 0.07)" : "rgba(63, 178, 255, 0.02)",
  transition: "background-color 160ms ease, border-color 160ms ease",
  "&:hover": {
    backgroundColor: $active ? "rgba(239, 131, 58, 0.12)" : "rgba(63, 178, 255, 0.06)",
  },
}));

const CardHead = styled("div")({
  display: "flex",
  alignItems: "baseline",
  gap: 10,
});

const HandChip = styled("span")<{ $hand: "left" | "right" }>(({ $hand }) => ({
  flexShrink: 0,
  whiteSpace: "nowrap",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 1,
  padding: "1px 7px",
  borderRadius: 4,
  color: $hand === "right" ? HUD.orange : HUD.cyan,
  border: `1px solid ${$hand === "right" ? "rgba(239,131,58,0.55)" : "rgba(63,178,255,0.45)"}`,
}));

const ActionTitle = styled("span")({
  minWidth: 0,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 1,
  color: HUD.text,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const TimeRange = styled("span")({
  marginLeft: "auto",
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  color: HUD.textDim,
  "@media (max-width: 900px)": { display: "none" },
});

const ActionText = styled("div")({
  fontSize: 22,
  lineHeight: 1.5,
  color: HUD.text,
  flex: 1,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  "@media (max-width: 900px)": { fontSize: 18 },
});

const ObjectLine = styled("div")({
  fontSize: 14,
  color: HUD.textDim,
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

function pickActive(list: ActionAnnotation[], t: number): ActionAnnotation | undefined {
  return (
    list.find((a) => t >= a.start && t < a.end) ??
    (t >= list[list.length - 1]?.end ? list[list.length - 1] : undefined)
  );
}

/** 底部标注条：上=标题行（含时间码），下=左右手动作标注卡 */
export default function AnnotationBar() {
  const { annotations, currentTime, duration, seek, isPlaying, setPlaying } = usePlayback();

  const leftList = annotations.filter((a) => a.hand === "left");
  const rightList = annotations.filter((a) => a.hand === "right");
  const activeLeft = pickActive(leftList, currentTime);
  const activeRight = pickActive(rightList, currentTime);

  const renderCard = (hand: "left" | "right", list: ActionAnnotation[], active: ActionAnnotation | undefined) => {
    const next = list.find((a) => a.start > currentTime);
    return (
      <HandCard
        key={hand}
        $active={Boolean(active && currentTime >= active.start && currentTime < active.end)}
        onClick={() => {
          const target = active ?? next;
          if (!target) return;
          seek(target.start);
          setPlaying(true);
        }}
      >
        <CardHead>
          <HandChip $hand={hand}>{hand === "left" ? "左手" : "右手"}</HandChip>
          <ActionTitle>{active ? active.title : "待命"}</ActionTitle>
          <TimeRange>
            {active
              ? `${formatAnnotationTime(active.start)} → ${formatAnnotationTime(active.end)}`
              : next
                ? `下一条 ${formatAnnotationTime(next.start)}`
                : "本段无标注"}
          </TimeRange>
        </CardHead>
        <ActionText>
          {active
            ? active.text
            : next
              ? `等待换 ${hand === "left" ? "左" : "右"} 手执行：${next.text}`
              : `${hand === "left" ? "左" : "右"} 手动作已全部标注完成。`}
        </ActionText>
        <ObjectLine>物体：{active ? active.objects : next ? next.objects : "—"}</ObjectLine>
      </HandCard>
    );
  };

  return (
    <Bar>
      <HeaderRow>
        <HeaderTitle>动作标注</HeaderTitle>
        <TaskName>清洗黄色杯子</TaskName>
        <TimeBlock>
          <PlayButton
            type="button"
            aria-label={isPlaying ? "暂停" : "播放"}
            title={isPlaying ? "暂停" : "播放"}
            onClick={() => setPlaying(!isPlaying)}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </PlayButton>
          <TimeCode>
            {formatAnnotationTime(currentTime)} / {formatAnnotationTime(duration)}
          </TimeCode>
        </TimeBlock>
      </HeaderRow>

      <CardsRow>
        {renderCard("left", leftList, activeLeft)}
        {renderCard("right", rightList, activeRight)}
      </CardsRow>
    </Bar>
  );
}
