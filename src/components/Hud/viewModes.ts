/**
 * 「菜单栏」的三个视图：分割图 = 现在右栏那三个图（轨迹 + 左右手），
 * 点云图 / 深度图 = 同一块区域换成对应的采集数据画面。
 */
export const VIEW_MODES = ["深度图", "点云图", "分割图"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** 分割图以外、用静态画面填充的视图 */
export type DataMode = Exclude<ViewMode, "分割图">;

/** 数据画面只出图，画面外不再挂任何规格文字 */
export const DATA_SOURCES: Record<DataMode, string> = {
  点云图: "/modules/pointcloud.jpg",
  深度图: "/modules/depth.png",
};
