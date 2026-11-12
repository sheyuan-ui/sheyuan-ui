/**
 * 「菜单栏」的视图：分割图 = 现在右栏那三个图（轨迹 + 左右手），
 * 点云图 / 深度图 = 同一块区域换成对应的采集数据画面，
 * 3D图 = 放大的手部三维场景（复用分割图里的轨迹场景）。
 */
export const VIEW_MODES = ["深度图", "点云图", "分割图", "3D图"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** 用静态画面填充的视图 */
export type DataMode = Exclude<ViewMode, "分割图" | "3D图">;

/** 数据画面只出图，画面外不再挂任何规格文字 */
export const DATA_SOURCES: Record<DataMode, string> = {
  点云图: "/modules/pointcloud.jpg",
  深度图: "/modules/depth.png",
};

export interface ImagePalette {
  id: string;
  label: string;
  /** 作用在示例图上的 CSS 滤镜 */
  filter: string;
  /** 右侧边栏色块的颜色 */
  swatch: string;
}

/** 点云 / 深度共用的色带 */
export const IMAGE_PALETTES: ImagePalette[] = [
  {
    id: "raw",
    label: "原色",
    filter: "none",
    swatch: "linear-gradient(135deg, #4a90d9, #f2a33c)",
  },
  {
    id: "cold",
    label: "冷色",
    filter: "hue-rotate(155deg) saturate(1.35) brightness(1.05)",
    swatch: "linear-gradient(135deg, #2f7bff, #6ff2ff)",
  },
  {
    id: "warm",
    label: "暖色",
    filter: "hue-rotate(-95deg) saturate(1.5) brightness(1.05)",
    swatch: "linear-gradient(135deg, #ff7a3d, #ffd166)",
  },
  {
    id: "mono",
    label: "灰度",
    filter: "grayscale(1) contrast(1.15)",
    swatch: "linear-gradient(135deg, #e8eef8, #5a6470)",
  },
];

export interface HandPalette {
  id: string;
  label: string;
  left: string;
  right: string;
  cam: string;
  swatch: string;
}

/** 3D 视图里双手、轨迹与相机的配色 */
export const HAND_PALETTES: HandPalette[] = [
  {
    id: "teal",
    label: "青金",
    left: "#3fd0c9",
    right: "#f2a33c",
    cam: "#8a93a3",
    swatch: "linear-gradient(90deg, #3fd0c9, #f2a33c)",
  },
  {
    id: "azur",
    label: "蔚蓝",
    left: "#3fb2ff",
    right: "#ff8a3d",
    cam: "#8a93a3",
    swatch: "linear-gradient(90deg, #3fb2ff, #ff8a3d)",
  },
  {
    id: "violet",
    label: "绿紫",
    left: "#5fd08a",
    right: "#b071ff",
    cam: "#8a93a3",
    swatch: "linear-gradient(90deg, #5fd08a, #b071ff)",
  },
];

export interface Backdrop {
  id: string;
  label: string;
  color: string;
}

/** 各视图共用的底色 */
export const BACKDROPS: Backdrop[] = [
  { id: "black", label: "纯黑", color: "#000000" },
  { id: "navy", label: "深蓝", color: "#061225" },
  { id: "graphite", label: "石墨", color: "#15181d" },
];

/** 3D 图叠加用的底图：点云图 / 深度图 / 纯色 */
export type Base3D = DataMode | "none";

export const DEFAULT_BASE_3D: Base3D = "点云图";

/** 3D 图底图的显示参数（百分比 / 像素） */
export interface BaseAdjust {
  opacity: number;
  brightness: number;
  contrast: number;
  /** 100% = 原大小，往上裁进画面看细节 */
  scale: number;
  /** 让底图退到 3D 场景后面 */
  blur: number;
}

export const DEFAULT_BASE_ADJUST: BaseAdjust = {
  opacity: 100,
  brightness: 100,
  contrast: 100,
  scale: 100,
  blur: 0,
};

export interface ViewAttrs {
  palette: string;
  bg: string;
}

export const DEFAULT_ATTRS: Record<ViewMode, ViewAttrs> = {
  分割图: { palette: "raw", bg: "black" },
  点云图: { palette: "raw", bg: "black" },
  深度图: { palette: "raw", bg: "black" },
  "3D图": { palette: "teal", bg: "black" },
};
