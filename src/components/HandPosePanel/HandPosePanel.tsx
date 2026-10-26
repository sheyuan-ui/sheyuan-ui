import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import HandModel from "../Hud/HandModel";
import TrajectoryScene from "./TrajectoryScene";
import { ViewColumn as Column } from "../Hud/ViewColumn";
import { usePlayback } from "../../contexts/PlaybackContext";

const CAM_COLOR = "#8a93a3";
const L_COLOR = "#3fd0c9";
const R_COLOR = HUD.gold;


/** 浮在画面上的文字，不占据布局空间 */
const FloatText = styled("div")<{ $color?: string }>(({ $color }) => ({
  position: "absolute",
  left: 8,
  top: 6,
  fontSize: 12,
  letterSpacing: 3,
  lineHeight: "16px",
  color: $color ?? HUD.text,
  pointerEvents: "none",
  zIndex: 3,
  textShadow: "0 0 10px rgba(3, 10, 22, 0.95), 0 1px 2px rgba(0, 0, 0, 0.8)",
  whiteSpace: "nowrap",
}));

/** 上半：轨迹合成画面，横窗，吃掉手窗以外的全部高度 */
const TrajBox = styled("div")(({ theme }) => ({
  position: "relative",
  flex: 1,
  minHeight: 0,
  backgroundColor: theme.palette.background.paper,
  overflow: "hidden",
}));

const Legend = styled("div")({
  position: "absolute",
  top: 6,
  right: 8,
  display: "flex",
  gap: 10,
  fontSize: 10,
  color: HUD.textDim,
  pointerEvents: "none",
  "& > span": { display: "inline-flex", alignItems: "center", gap: 4 },
  "& i": {
    display: "inline-block",
    width: 12,
    height: 2,
    borderRadius: 1,
  },
});

const ScaleTag = styled("div")({
  position: "absolute",
  bottom: 6,
  right: 8,
  display: "flex",
  alignItems: "flex-end",
  gap: 5,
  fontSize: 10,
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  color: HUD.textDim,
  pointerEvents: "none",
});

const ScaleBracket = styled("div")({
  width: 44,
  height: 6,
  borderLeft: "1px solid #c8d4e6",
  borderRight: "1px solid #c8d4e6",
  borderBottom: "1px solid #c8d4e6",
});

/** 下半：手部姿态两小窗，高度锁成栏宽的一半，两窗正好各是方窗 */
const PoseRow = styled("div")(({ theme }) => ({
  display: "flex",
  flex: "0 0 auto",
  aspectRatio: "2 / 1",
  // 内容的最小高度不参与拉伸，否则行高会被撑大、轨迹窗不再是方窗
  minHeight: 0,
  "& > * + *": { borderLeft: `1px solid ${theme.palette.divider}` },
}));

const PoseBox = styled("div")(({ theme }) => ({
  position: "relative",
  flex: 1,
  minWidth: 0,
  backgroundColor: theme.palette.background.paper,
  overflow: "hidden",
}));

/** 手窗底纹，垫在三维手模后面 */
const Stage = styled("svg")({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
});

/** 上半：双手与相机的三维轨迹，按住拖动环绕，滚轮推拉，双击复位 */
function TrajectoryView() {
  const { currentTime } = usePlayback();

  return (
    <TrajBox>
      <TrajectoryScene
        time={currentTime}
        leftColor={L_COLOR}
        rightColor={R_COLOR}
        camColor={CAM_COLOR}
      />
      <FloatText>手部姿态</FloatText>

      <Legend>
        <span><i style={{ backgroundColor: CAM_COLOR }} />相机</span>
        <span><i style={{ backgroundColor: L_COLOR }} />左腕</span>
        <span><i style={{ backgroundColor: R_COLOR }} />右腕</span>
      </Legend>

      <ScaleTag>
        <ScaleBracket />
        1 m
      </ScaleTag>
    </TrajBox>
  );
}

/** 手窗底纹：中心十字 + 参考圆，给孤立的模型一个空间参照 */
function HandStage() {
  return (
    <g pointerEvents="none">
      <g stroke={HUD.line} strokeWidth="0.3" opacity="0.55">
        <line x1="50" y1="8" x2="50" y2="92" strokeDasharray="2 3" />
        <line x1="8" y1="50" x2="92" y2="50" strokeDasharray="2 3" />
      </g>
      <circle cx="50" cy="50" r="30" fill="none" stroke={HUD.line} strokeWidth="0.3" opacity="0.5" />
      <circle cx="50" cy="50" r="30" fill={HUD.cyan} opacity="0.035" />
      <ellipse cx="50" cy="84" rx="24" ry="4.5" fill="rgba(0,0,0,0.5)" opacity="0.5" />
    </g>
  );
}

/** 右列：上=双手轨迹实时合成，下=左右手各自的三维姿态 */
export default function HandPosePanel() {
  const { currentTime } = usePlayback();

  return (
    <Column>
      <TrajectoryView />

      <PoseRow>
        <PoseBox>
          <FloatText $color={L_COLOR}>左 手</FloatText>
          <Stage viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden>
            <HandStage />
          </Stage>
          <HandModel side="left" color={L_COLOR} time={currentTime} />
        </PoseBox>

        <PoseBox>
          <FloatText $color={R_COLOR}>右 手</FloatText>
          <Stage viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden>
            <HandStage />
          </Stage>
          <HandModel side="right" color={R_COLOR} time={currentTime} />
        </PoseBox>
      </PoseRow>
    </Column>
  );
}
