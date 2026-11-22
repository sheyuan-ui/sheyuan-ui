import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import ShotPanel from "../Hud/ShotPanel";

export type CameraEye = "left" | "right";

/** 左右目画面容器：两格直接拼接，外部分割线由 MainArea 统一给 */
const Eyes = styled("div")({
  position: "relative",
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  backgroundColor: "#04090f",
});

/** 当前展示的设备；顶栏切换设备后同步变化 */
const DeviceBadge = styled("div")({
  position: "absolute",
  top: 10,
  right: 12,
  zIndex: 6,
  padding: "1px 8px",
  borderRadius: 4,
  border: `1px solid ${HUD.lineSoft}`,
  backgroundColor: "rgba(4, 9, 15, 0.55)",
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  fontSize: 10.5,
  letterSpacing: 0.5,
  fontVariantNumeric: "tabular-nums",
  color: HUD.text,
  pointerEvents: "none",
});

/** 演示画面按设备区分：01 为原始拍屏，02 使用镜像画面，其余用色彩区分 */
const FEEDS: Record<string, { src: string; filter?: string }> = {
  "01": { src: "/modules/main.png" },
  "02": { src: "/modules/main-02.png", filter: "brightness(0.97) saturate(0.94)" },
  "03": { src: "/modules/main.png", filter: "brightness(0.92) saturate(0.86)" },
  "04": { src: "/modules/main.png", filter: "contrast(1.08) brightness(0.9)" },
};

const feedFor = (deviceId: string | null) =>
  (deviceId ? FEEDS[deviceId.split("-").pop() ?? ""] : undefined) ?? FEEDS["01"];

/** 画面左上角的眼睛标识 */
const EyeLabel = styled("div")({
  position: "absolute",
  top: 10,
  left: 12,
  zIndex: 6,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "1px 8px",
  borderRadius: 4,
  fontSize: 10.5,
  letterSpacing: 0.8,
  color: HUD.textDim,
  backgroundColor: "rgba(4, 9, 15, 0.55)",
  border: `1px solid ${HUD.lineSoft}`,
  "&::before": {
    content: '""',
    width: 5,
    height: 5,
    borderRadius: "50%",
    backgroundColor: HUD.cyan,
    boxShadow: "0 0 4px rgba(63, 178, 255, 0.5)",
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

interface VideoPanelProps {
  /** 当前展示的设备；由顶栏设备菜单切换 */
  deviceId: string | null;
  expanded: CameraEye | null;
  onToggle: (eye: CameraEye) => void;
}

/**
 * 主视图：左右目两路采集画面拼成一块，各自半区内按原始比例完整显示。
 * 双击某一路画面 → 该路平滑放大成单画面（另一路收拢淡出）；再双击放大中的画面 → 回到双目。
 * 单画面态下滚轮以光标为锚点放大/缩小画面（1×–4×）。
 * 目前两路都先用同一张演示截图占位。
 */
export default function VideoPanel({ deviceId, expanded, onToggle }: VideoPanelProps) {
  const stateOf = (eye: CameraEye): EyeState =>
    expanded === null ? "dual" : expanded === eye ? "expanded" : "collapsed";
  const feed = feedFor(deviceId);
  const deviceText = deviceId ?? "未选择设备";

  return (
    <Eyes>
      <DeviceBadge>{deviceText}</DeviceBadge>
      <EyeShot
        $state={stateOf("left")}
        src={feed.src}
        imageFilter={feed.filter}
        alt={`${deviceText} 左目采集画面 · 双手关键点实时追踪`}
        onPictureDoubleClick={() => onToggle("left")}
        wheelZoom={expanded === "left"}
      >
        <EyeLabel>左目</EyeLabel>
      </EyeShot>
      <EyeShot
        $state={stateOf("right")}
        src={feed.src}
        imageFilter={feed.filter}
        alt={`${deviceText} 右目采集画面 · 双手关键点实时追踪`}
        onPictureDoubleClick={() => onToggle("right")}
        wheelZoom={expanded === "right"}
      >
        <EyeLabel>右目</EyeLabel>
      </EyeShot>
    </Eyes>
  );
}
