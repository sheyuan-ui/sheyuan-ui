import { API } from "../contracts/api";
import { request } from "./client";
import type { DeviceCodeEntry } from "./useDevices";

/** 登记设备码；device_id 留空表示只入白名单，扫码配对时再绑定。 */
export function registerDeviceCode(
  code: string,
  deviceId: string | null = null,
): Promise<DeviceCodeEntry> {
  return request<DeviceCodeEntry>(API.deviceCodes, {
    json: { code, device_id: deviceId },
  });
}

/** 移除设备码；服务端会同步断开已绑定设备。 */
export function removeDeviceCode(code: string): Promise<{ code: string; device_id: string | null }> {
  return request<{ code: string; device_id: string | null }>(API.deviceCode(code), {
    method: "DELETE",
  });
}