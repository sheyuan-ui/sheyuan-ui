/** 设备码库：PAD 用它校验设备热点返回的设备码 */
export interface DeviceCodeEntry {
  id: string;
  code: string;
}

/** 原型里设备码由设备号稳定生成，便于演示「设备返回设备码」 */
export const codeOf = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 0xffffff;
  }
  const no = id.split("-").pop() ?? id;
  return `SY-H${no}-${hash.toString(16).toUpperCase().padStart(6, "0")}`;
};

export const INITIAL_CODES: DeviceCodeEntry[] = [
  "头盔-01",
  "头盔-02",
  "头盔-03",
  "头盔-04",
].map((id) => ({ id, code: codeOf(id) }));

/** 设备码库属于业务状态，刷新后保留 */
const CODES_KEY = "sheyuan.device-codes";

export const loadCodes = (): DeviceCodeEntry[] => {
  try {
    const raw = window.localStorage.getItem(CODES_KEY);
    if (raw === null) return INITIAL_CODES;
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return INITIAL_CODES;
    return list.filter(
      (item): item is DeviceCodeEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as DeviceCodeEntry).id === "string" &&
        typeof (item as DeviceCodeEntry).code === "string",
    );
  } catch {
    return INITIAL_CODES;
  }
};

export const saveCodes = (codes: DeviceCodeEntry[]) => {
  try {
    window.localStorage.setItem(CODES_KEY, JSON.stringify(codes));
  } catch {
    /* 隐私模式下写入失败时仅保留内存状态 */
  }
};