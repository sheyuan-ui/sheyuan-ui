/**
 * 「菜单栏」的视图：分割图 = 现在右栏那三个图（轨迹 + 左右手），
 * 深度图 / 点云图 / 手部图 = 同一块区域换成对应的静态画面。
 */
export const VIEW_MODES = ["深度图", "点云图", "分割图", "手部图"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** 用静态画面填充的视图 */
export type DataMode = Exclude<ViewMode, "分割图">;

/** 数据画面只出图，画面外不再挂任何规格文字；手部图用双手关键点渲染图占位 */
export const DATA_SOURCES: Record<DataMode, string> = {
  点云图: "/modules/pointcloud.jpg",
  深度图: "/modules/depth.png",
  手部图: "/modules/effect-hand.png",
};
