import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { DATA_SOURCES, type DataMode } from "../Hud/viewModes";

/** 展示画面：图片按左右目画面的画幅比例居中显示，高度与两路采集画面一致 */
const Stage = styled("div")({
  position: "relative",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  backgroundColor: "#04090f",
  userSelect: "none",
  display: "flex",
  alignItems: "center",
});

/** 采集画面 275×158 的画幅；三栏等宽时右图与左右目上下边对齐 */
const Frame = styled("div")({
  width: "100%",
  aspectRatio: "275 / 158",
  overflow: "hidden",
});

const Picture = styled("img")({
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "cover",
  userSelect: "none",
});

const ModeTag = styled("span")({
  position: "absolute",
  top: 10,
  left: 12,
  zIndex: 6,
  padding: "1px 8px",
  borderRadius: 4,
  border: `1px solid ${HUD.lineSoft}`,
  backgroundColor: "rgba(4, 9, 15, 0.55)",
  fontSize: 10.5,
  letterSpacing: 0.8,
  color: HUD.textDim,
  pointerEvents: "none",
});

interface ViewerPanelProps {
  mode: DataMode;
}

export default function ViewerPanel({ mode }: ViewerPanelProps) {
  return (
    <Stage>
      <Frame>
        <Picture src={encodeURI(DATA_SOURCES[mode])} alt={mode} draggable={false} />
      </Frame>
      <ModeTag>{mode}</ModeTag>
    </Stage>
  );
}
