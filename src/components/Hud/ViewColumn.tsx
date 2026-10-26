import { styled } from "@mui/material/styles";

/**
 * 「菜单栏」切换的那一块视图区外壳（右栏）。
 * 分割图（轨迹 + 左右手三窗）、点云图、深度图共用这条栏，切换时布局不会跳。
 *
 * 尺寸规则：栏宽 = 可用高度 × 0.8（aspect-ratio 4/5）。
 * 分割图里下方左右手两窗各占栏宽的一半、都是方窗（合计栏高的一半），
 * 上方轨迹窗吃剩下的高度，并按实际宽高比重排 viewBox，所以横窗也不留黑边。
 * maxWidth 只用来给主视图保底：轨迹窗会自适应窗形，压窄不会产生黑边。
 */
export const ViewColumn = styled("div")(({ theme }) => ({
  aspectRatio: "4 / 5",
  flex: "0 0 auto",
  minWidth: 240,
  maxWidth: "calc(100% - 220px)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  backgroundColor: theme.palette.background.default,
  // 上下两区不留缝，中间一条线
  "& > * + *": { borderTop: `1px solid ${theme.palette.divider}` },
}));
