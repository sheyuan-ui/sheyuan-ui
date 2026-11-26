import type { DeviceRuntimeView, DeviceStatus } from "../contracts/types.ts";
import type { PairStatus } from "../repos/devices.ts";

/** 设备总览行：契约对象 DeviceStatus 之外补充配对态、别名与四态派生视图（服务端封装，不改原始字段）。 */
export interface DeviceSummary {
  device_id: string;
  alias: string | null;
  pair_status: PairStatus;
  status: DeviceStatus | null;
  /** 四态派生（T07）：由心跳与设备快照实时计算，不入库 */
  runtime: DeviceRuntimeView;
}