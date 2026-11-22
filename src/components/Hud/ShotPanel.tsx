import { useEffect, useRef, useState } from "react";
import { styled } from "@mui/material/styles";

/** 滚轮缩放范围与每格步长 */
const MAX_SCALE = 4;
const STEP = 1.15;

interface Zoom {
  s: number;
  dx: number;
  dy: number;
}

const NO_ZOOM: Zoom = { s: 1, dx: 0, dy: 0 };

/**
 * 采集画面面板：图片按原始比例完整显示（contain），不裁切、不做虚化底。
 * - onPictureDoubleClick：双击落在"画面本身"时触发，点深色留白不算。
 * - wheelZoom：单画面放大态下用滚轮以光标为锚点缩放画面。
 */
const Box = styled("div")({
  position: "relative",
  overflow: "hidden",
  minWidth: 0,
  backgroundColor: "#04090f",
  userSelect: "none",
});

const Img = styled("img")<{ $clickable: boolean }>(({ $clickable }) => ({
  position: "relative",
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "contain",
  userSelect: "none",
  pointerEvents: $clickable ? "auto" : "none",
  transformOrigin: "0 0",
  transition: "transform 90ms linear",
}));

interface ShotPanelProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /** 叠加在画面上的色彩处理，用于区分不同设备的演示画面 */
  imageFilter?: string;
  onPictureDoubleClick?: () => void;
  /** 允许滚轮缩放（只在放大成单画面时打开） */
  wheelZoom?: boolean;
  children?: React.ReactNode;
}

export default function ShotPanel({
  src,
  alt,
  className,
  style,
  imageFilter,
  onPictureDoubleClick,
  wheelZoom = false,
  children,
}: ShotPanelProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const zoomRef = useRef<Zoom>(NO_ZOOM);

  const applyZoom = (next: Zoom) => {
    zoomRef.current = next;
    setZoom(next);
  };

  /** contain 之后画面在格子内的布局参数（不含缩放） */
  const geometry = () => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img || !img.naturalWidth || !img.naturalHeight) return null;
    const rect = box.getBoundingClientRect();
    const fit = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const w = img.naturalWidth * fit;
    const h = img.naturalHeight * fit;
    return { rect, w, h, lx: (rect.width - w) / 2, ly: (rect.height - h) / 2 };
  };

  /** 画面当前实际显示出来的矩形（视口坐标） */
  const shownRect = () => {
    const g = geometry();
    if (!g) return null;
    const { s, dx, dy } = zoomRef.current;
    return {
      left: g.rect.left + g.lx * s + dx,
      top: g.rect.top + g.ly * s + dy,
      width: g.w * s,
      height: g.h * s,
    };
  };

  // 退出单画面时清掉缩放
  useEffect(() => {
    if (!wheelZoom) applyZoom(NO_ZOOM);
  }, [wheelZoom]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !wheelZoom) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const g = geometry();
      if (!g) return;
      const cur = zoomRef.current;
      const s = Math.min(MAX_SCALE, Math.max(1, cur.s * (e.deltaY < 0 ? STEP : 1 / STEP)));
      if (s === 1) {
        if (cur.s !== 1) applyZoom(NO_ZOOM);
        return;
      }
      if (s === cur.s) return;

      // 保持光标底下的那个画面点不动
      const before = shownRect();
      if (!before) return;
      const fx = (e.clientX - before.left) / before.width;
      const fy = (e.clientY - before.top) / before.height;
      let dx = e.clientX - g.rect.left - (g.lx + fx * g.w) * s;
      let dy = e.clientY - g.rect.top - (g.ly + fy * g.h) * s;
      // 允许平移的极限：画面中心不能跑出格子
      dx = Math.min(g.rect.width - s * (g.lx + g.w / 2), Math.max(-s * (g.lx + g.w / 2), dx));
      dy = Math.min(g.rect.height - s * (g.ly + g.h / 2), Math.max(-s * (g.ly + g.h / 2), dy));
      applyZoom({ s, dx, dy });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [wheelZoom]);

  const handleDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!onPictureDoubleClick) return;
    const shown = shownRect();
    if (!shown) return;
    const inside =
      e.clientX >= shown.left &&
      e.clientX <= shown.left + shown.width &&
      e.clientY >= shown.top &&
      e.clientY <= shown.top + shown.height;
    if (inside) onPictureDoubleClick();
  };

  return (
    <Box ref={boxRef} className={className} style={style}>
      <Img
        ref={imgRef}
        src={encodeURI(src)}
        alt={alt}
        draggable={false}
        $clickable={!!onPictureDoubleClick}
        style={{
          transform: `translate(${zoom.dx.toFixed(2)}px, ${zoom.dy.toFixed(2)}px) scale(${zoom.s.toFixed(3)})`,
          filter: imageFilter,
        }}
        onDoubleClick={handleDoubleClick}
      />
      {children}
    </Box>
  );
}
