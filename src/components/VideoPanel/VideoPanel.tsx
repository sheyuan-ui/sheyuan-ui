import { useState } from "react";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import ShotPanel from "../Hud/ShotPanel";

type CameraEye = "left" | "right";

/** 左右目画面容器：两格直接拼接，外部分割线由 MainArea 统一给 */
const Eyes = styled("div")({
  display: "flex",
  flex: 1,
  minWidth: 0,
  backgroundColor: "#04090f",
});

/** 画面左上角的眼睛标识 */
const EyeLabel = styled("div")({
  position: "absolute",
  top: 8,
  left: 10,
  zIndex: 6,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 11,
  letterSpacing: 2,
  color: HUD.text,
  backgroundColor: "rgba(6, 13, 27, 0.7)",
  border: `1px solid ${HUD.line}`,
  "&::before": {
    content: '""',
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: HUD.cyan,
    boxShadow: `0 0 6px ${HUD.cyan}`,
  },
});

type EyeState = "dual" | "expanded" | "collapsed";

/** 单路画面格：靠 flex-grow 过渡实现双目 ⇄ 单画面的平滑缩放 */
const EyeShot = styled(ShotPanel)<{ $state: EyeState }>(({ $state }) => ({
  flex: $state === "collapsed" ? "0 1 0px" : "1 1 0px",
  minWidth: 0,
  opacity: $state === "collapsed" ? 0 : 1,
  pointerEvents: $state === "collapsed" ? "none" : "auto",
  transition:
    "flex-grow 320ms cubic-bezier(0.25, 0.8, 0.3, 1), opacity 180ms ease",
}));

/**
 * 主视图：左右目两路采集画面拼成一块，各自半区内按原始比例完整显示。
 * 双击某一路画面 → 该路平滑放大成单画面（另一路收拢淡出）；再双击放大中的画面 → 回到双目。
 * 单画面态下滚轮以光标为锚点放大/缩小画面（1×–4×）。
 * 目前两路都先用同一张演示截图占位。
 */
export default function VideoPanel() {
  const [expanded, setExpanded] = useState<CameraEye | null>(null);

  const toggle = (eye: CameraEye) => () =>
    setExpanded((current) => (current === eye ? null : eye));

  const stateOf = (eye: CameraEye): EyeState =>
    expanded === null ? "dual" : expanded === eye ? "expanded" : "collapsed";

  return (
    <Eyes>
      <EyeShot
        $state={stateOf("left")}
        src="/modules/main.png"
        alt="左目采集画面 · 双手关键点实时追踪"
        onPictureDoubleClick={toggle("left")}
        wheelZoom={expanded === "left"}
      >
        <EyeLabel>左目</EyeLabel>
      </EyeShot>
      <EyeShot
        $state={stateOf("right")}
        src="/modules/main.png"
        alt="右目采集画面 · 双手关键点实时追踪"
        onPictureDoubleClick={toggle("right")}
        wheelZoom={expanded === "right"}
      >
        <EyeLabel>右目</EyeLabel>
      </EyeShot>
    </Eyes>
  );
}
