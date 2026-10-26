import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { ViewColumn } from "../Hud/ViewColumn";
import ShotPanel from "../Hud/ShotPanel";
import { DATA_SOURCES, type DataMode } from "../Hud/viewModes";

/**
 * 点云图 / 深度图：占的和分割图是同一条栏。
 * 画面按原始比例完整显示（16:9，不裁切），不做虚化、不铺满。
 */
const Pane = styled("div")({
  position: "relative",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  backgroundColor: "#000",
  userSelect: "none",
});

const Label = styled("div")({
  position: "absolute",
  left: 10,
  top: 8,
  zIndex: 2,
  pointerEvents: "none",
});

const Title = styled("span")({
  fontSize: 12,
  letterSpacing: 3,
  color: HUD.text,
  textShadow: "0 0 10px rgba(3, 10, 22, 0.95), 0 1px 2px rgba(0, 0, 0, 0.8)",
  whiteSpace: "nowrap",
});

interface DataViewPanelProps {
  mode: DataMode;
}

export default function DataViewPanel({ mode }: DataViewPanelProps) {
  const src = DATA_SOURCES[mode];

  return (
    <ViewColumn>
      <Pane>
        <Label>
          <Title>{mode}</Title>
        </Label>
        <ShotPanel src={src} alt={mode} style={{ flex: 1, minHeight: 0 }} />
      </Pane>
    </ViewColumn>
  );
}
