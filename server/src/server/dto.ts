import type { DeviceStatus } from "../contracts/types.ts";
import type { PairStatus } from "../repos/devices.ts";

/** 设备总览行：契约对象 DeviceStatus 之外补充配对态与别名（服务端封装，不改契约字段）。 */
export interface DeviceSummary {
  device_id: string;
  alias: string | null;
  pair_status: PairStatus;
  status: DeviceStatus | null;
}