import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import {
  BACKDROPS,
  DEFAULT_BASE_ADJUST,
  IMAGE_PALETTES,
  VIEW_MODES,
  type Base3D,
  type BaseAdjust,
  type ViewAttrs,
  type ViewMode,
} from "../Hud/viewModes";

const BASE_OPTIONS: { id: Base3D; label: string; title: string }[] = [
  { id: "点云图", label: "点云", title: "以点云图为底图" },
  { id: "深度图", label: "深度", title: "以深度图为底图" },
  { id: "none", label: "无", title: "不叠底图，只显示 3D 场景" },
];

const Panel = styled("div")({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 8px",
  overflowY: "auto",
});

const SectionTitle = styled("div")({
  padding: "6px 4px 2px",
  fontSize: 11,
  letterSpacing: 1,
  color: HUD.textDim,
  userSelect: "none",
});

const ViewButton = styled("button")<{ $on: boolean }>(({ $on }) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "5px 6px",
  border: "none",
  borderRadius: 3,
  background: $on ? "rgba(63, 178, 255, 0.12)" : "none",
  color: $on ? HUD.cyan : HUD.text,
  fontSize: 13,
  letterSpacing: 1,
  textAlign: "left",
  cursor: "pointer",
  transition: "background-color 140ms ease, color 140ms ease",
  "&:hover": { backgroundColor: "rgba(63, 178, 255, 0.10)", color: HUD.text },
}));

const Dot = styled("span")<{ $on: boolean }>(({ $on }) => ({
  width: 6,
  height: 6,
  flexShrink: 0,
  borderRadius: "50%",
  backgroundColor: $on ? HUD.cyan : HUD.textDim,
  boxShadow: $on ? `0 0 6px ${HUD.cyan}` : "none",
  transition: "background-color 140ms ease",
}));

const SwatchRow = styled("div")({
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  padding: "2px 4px 4px",
});

const Swatch = styled("button")<{ $active: boolean; $bg: string }>(({ $active, $bg }) => ({
  width: 22,
  height: 22,
  padding: 0,
  borderRadius: 3,
  background: $bg,
  border: `1px solid ${$active ? HUD.cyan : HUD.line}`,
  boxShadow: $active ? `0 0 0 1px ${HUD.cyan}, 0 0 8px rgba(63, 178, 255, 0.35)` : "none",
  cursor: "pointer",
  transition: "border-color 140ms ease, box-shadow 140ms ease",
}));

const TitleRow = styled("div")({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 4px 2px",
  fontSize: 11,
  letterSpacing: 1,
  color: HUD.textDim,
  userSelect: "none",
});

const ResetButton = styled("button")({
  border: "none",
  background: "none",
  padding: "0 2px",
  fontSize: 10,
  color: HUD.textDim,
  cursor: "pointer",
  transition: "color 140ms ease",
  "&:hover": { color: HUD.cyan },
});

const AdjustGroup = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 7,
  padding: "2px 4px 4px",
});

const RangeRow = styled("label")({
  display: "flex",
  flexDirection: "column",
  gap: 1,
});

const RangeHead = styled("div")({
  display: "flex",
  justifyContent: "space-between",
  fontSize: 10,
  letterSpacing: 1,
  color: HUD.textDim,
  userSelect: "none",
});

const Range = styled("input")({
  width: "100%",
  height: 12,
  margin: 0,
  accentColor: HUD.cyan,
  cursor: "pointer",
});

const BaseRow = styled("div")({
  display: "flex",
  gap: 5,
  padding: "2px 4px 4px",
});

const BaseButton = styled("button")<{ $on: boolean }>(({ $on }) => ({
  flex: 1,
  padding: "3px 0",
  border: `1px solid ${$on ? HUD.cyan : HUD.line}`,
  borderRadius: 3,
  background: $on ? "rgba(63, 178, 255, 0.12)" : "transparent",
  color: $on ? HUD.cyan : HUD.textDim,
  fontSize: 11,
  letterSpacing: 1,
  cursor: "pointer",
  transition: "border-color 140ms ease, background-color 140ms ease, color 140ms ease",
  "&:hover": { borderColor: HUD.lineStrong, color: HUD.text },
}));

interface ViewerControlsProps {
  mode: ViewMode;
  onMode: (mode: ViewMode) => void;
  attrs: ViewAttrs;
  onChange: (patch: Partial<ViewAttrs>) => void;
  /** 3D 图的底图、底图色带与显示参数 */
  base: Base3D;
  baseAttrs: ViewAttrs;
  baseAdjust: BaseAdjust;
  onBase: (base: Base3D) => void;
  onBasePalette: (palette: string) => void;
  onBaseAdjust: (patch: Partial<BaseAdjust>) => void;
}

export default function ViewerControls({
  mode,
  onMode,
  attrs,
  onChange,
  base,
  baseAttrs,
  baseAdjust,
  onBase,
  onBasePalette,
  onBaseAdjust,
}: ViewerControlsProps) {
  const imageMode = mode === "点云图" || mode === "深度图";

  return (
    <Panel>
      {mode !== "3D图" && (
        <>
          <SectionTitle>显示</SectionTitle>
          {VIEW_MODES.map((m) => (
            <ViewButton key={m} type="button" $on={mode === m} onClick={() => onMode(m)}>
              <Dot $on={mode === m} />
              {m}
            </ViewButton>
          ))}
        </>
      )}

      {imageMode && (
        <>
          <SectionTitle>色带</SectionTitle>
          <SwatchRow>
            {IMAGE_PALETTES.map((p) => (
              <Swatch
                key={p.id}
                type="button"
                title={p.label}
                aria-label={p.label}
                $active={attrs.palette === p.id}
                $bg={p.swatch}
                onClick={() => onChange({ palette: p.id })}
              />
            ))}
          </SwatchRow>
        </>
      )}

      {mode === "3D图" && (
        <>
          <SectionTitle>底图</SectionTitle>
          <BaseRow>
            {BASE_OPTIONS.map((o) => (
              <BaseButton
                key={o.id}
                type="button"
                title={o.title}
                $on={base === o.id}
                onClick={() => onBase(o.id)}
              >
                {o.label}
              </BaseButton>
            ))}
          </BaseRow>

          {base !== "none" && (
            <>
              <SectionTitle>底图色带</SectionTitle>
              <SwatchRow>
                {IMAGE_PALETTES.map((p) => (
                  <Swatch
                    key={p.id}
                    type="button"
                    title={p.label}
                    aria-label={`底图-${p.label}`}
                    $active={baseAttrs.palette === p.id}
                    $bg={p.swatch}
                    onClick={() => onBasePalette(p.id)}
                  />
                ))}
              </SwatchRow>

              <TitleRow>
                <span>底图参数</span>
                <ResetButton
                  type="button"
                  onClick={() => onBaseAdjust(DEFAULT_BASE_ADJUST)}
                >
                  复位
                </ResetButton>
              </TitleRow>
              <AdjustGroup>
                <RangeRow>
                  <RangeHead>
                    <span>不透明度</span>
                    <span>{baseAdjust.opacity}%</span>
                  </RangeHead>
                  <Range
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={baseAdjust.opacity}
                    onChange={(e) => onBaseAdjust({ opacity: Number(e.target.value) })}
                  />
                </RangeRow>
                <RangeRow>
                  <RangeHead>
                    <span>亮度</span>
                    <span>{baseAdjust.brightness}%</span>
                  </RangeHead>
                  <Range
                    type="range"
                    min={40}
                    max={160}
                    step={1}
                    value={baseAdjust.brightness}
                    onChange={(e) => onBaseAdjust({ brightness: Number(e.target.value) })}
                  />
                </RangeRow>
                <RangeRow>
                  <RangeHead>
                    <span>对比度</span>
                    <span>{baseAdjust.contrast}%</span>
                  </RangeHead>
                  <Range
                    type="range"
                    min={40}
                    max={160}
                    step={1}
                    value={baseAdjust.contrast}
                    onChange={(e) => onBaseAdjust({ contrast: Number(e.target.value) })}
                  />
                </RangeRow>
                <RangeRow>
                  <RangeHead>
                    <span>缩放</span>
                    <span>{baseAdjust.scale}%</span>
                  </RangeHead>
                  <Range
                    type="range"
                    min={100}
                    max={300}
                    step={5}
                    value={baseAdjust.scale}
                    onChange={(e) => onBaseAdjust({ scale: Number(e.target.value) })}
                  />
                </RangeRow>
                <RangeRow>
                  <RangeHead>
                    <span>虚化</span>
                    <span>{baseAdjust.blur}px</span>
                  </RangeHead>
                  <Range
                    type="range"
                    min={0}
                    max={12}
                    step={1}
                    value={baseAdjust.blur}
                    onChange={(e) => onBaseAdjust({ blur: Number(e.target.value) })}
                  />
                </RangeRow>
              </AdjustGroup>
            </>
          )}

        </>
      )}

      {mode !== "3D图" && (
        <>
          <SectionTitle>背景</SectionTitle>
          <SwatchRow>
            {BACKDROPS.map((b) => (
              <Swatch
                key={b.id}
                type="button"
                title={b.label}
                aria-label={b.label}
                $active={attrs.bg === b.id}
                $bg={b.color}
                onClick={() => onChange({ bg: b.id })}
              />
            ))}
          </SwatchRow>
        </>
      )}
    </Panel>
  );
}
