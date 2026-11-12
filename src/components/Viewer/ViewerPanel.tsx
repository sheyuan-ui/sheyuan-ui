import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { usePlayback } from "../../contexts/PlaybackContext";
import TrajectoryScene from "../HandPosePanel/TrajectoryScene";
import {
  BACKDROPS,
  DATA_SOURCES,
  HAND_PALETTES,
  IMAGE_PALETTES,
  type Base3D,
  type BaseAdjust,
  type ViewAttrs,
  type ViewMode,
} from "../Hud/viewModes";

/** 菜单栏管理的展示窗：3D 场景与采集画面都铺满这块区域 */
const Stage = styled("div")<{ $bg: string }>(({ $bg }) => ({
  position: "relative",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  backgroundColor: $bg,
  userSelect: "none",
}));

const FloatLabel = styled("div")({
  position: "absolute",
  left: 10,
  top: 8,
  zIndex: 2,
  pointerEvents: "none",
  fontSize: 12,
  letterSpacing: 3,
  color: HUD.text,
  textShadow: "0 0 10px rgba(3, 10, 22, 0.95), 0 1px 2px rgba(0, 0, 0, 0.8)",
  whiteSpace: "nowrap",
});

const Picture = styled("img")<{ $filter: string; $opacity: number; $scale: number }>(
  ({ $filter, $opacity, $scale }) => ({
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    filter: $filter,
    opacity: $opacity,
    transform: `scale(${$scale})`,
    transformOrigin: "50% 50%",
    userSelect: "none",
  }),
);

/** 色带滤镜与底图亮度/对比度/虚化合成一条 filter */
const filterOf = (palette: string, adjust?: BaseAdjust) => {
  const parts: string[] = [];
  const paletteFilter =
    (IMAGE_PALETTES.find((p) => p.id === palette) ?? IMAGE_PALETTES[0]).filter;
  if (paletteFilter !== "none") parts.push(paletteFilter);
  if (adjust) {
    if (adjust.brightness !== 100) parts.push(`brightness(${adjust.brightness}%)`);
    if (adjust.contrast !== 100) parts.push(`contrast(${adjust.contrast}%)`);
    if (adjust.blur > 0) parts.push(`blur(${adjust.blur}px)`);
  }
  return parts.length ? parts.join(" ") : "none";
};

interface ViewerPanelProps {
  mode: Exclude<ViewMode, "分割图">;
  attrs: ViewAttrs;
  /** 仅 3D 图使用：叠加在 3D 场景下方的底图 */
  base: Base3D;
  baseAttrs: ViewAttrs;
  baseAdjust: BaseAdjust;
}

export default function ViewerPanel({
  mode,
  attrs,
  base,
  baseAttrs,
  baseAdjust,
}: ViewerPanelProps) {
  const { currentTime } = usePlayback();
  const bg = BACKDROPS.find((b) => b.id === attrs.bg)?.color ?? "#000000";

  if (mode === "3D图") {
    const palette = HAND_PALETTES.find((p) => p.id === attrs.palette) ?? HAND_PALETTES[0];
    return (
      <Stage $bg={bg}>
        {base !== "none" && (
          <Picture
            src={encodeURI(DATA_SOURCES[base])}
            alt={base}
            draggable={false}
            $filter={filterOf(baseAttrs.palette, baseAdjust)}
            $opacity={baseAdjust.opacity / 100}
            $scale={baseAdjust.scale / 100}
          />
        )}
        <TrajectoryScene
          time={currentTime}
          leftColor={palette.left}
          rightColor={palette.right}
          camColor={palette.cam}
        />
        <FloatLabel>3D图</FloatLabel>
      </Stage>
    );
  }

  return (
    <Stage $bg={bg}>
      <Picture
        src={encodeURI(DATA_SOURCES[mode])}
        alt={mode}
        draggable={false}
        $filter={filterOf(attrs.palette)}
        $opacity={1}
        $scale={1}
      />
      <FloatLabel>{mode}</FloatLabel>
    </Stage>
  );
}
