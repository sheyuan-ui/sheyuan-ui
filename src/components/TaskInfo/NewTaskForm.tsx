import { useEffect, useRef, useState } from "react";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { useNotification } from "../../contexts/NotificationContext";

export interface DeviceOption {
  id: string;
  alias?: string;
  online: boolean;
  paired: boolean;
}

export interface NewTaskInput {
  name: string;
  site: string;
  hall: string;
  batch: string;
  leader: string;
  deviceIds: string[];
  note: string;
  attachments: string[];
}

interface NewTaskFormProps {
  devices: DeviceOption[];
  onCreate: (input: NewTaskInput) => void;
  onPaired: (id: string) => void;
}

const SITES = ["1号场区", "2号场区", "3号场区"];
const HALLS = ["1号栋", "2号栋", "3号栋", "4号栋"];

const PAIR_TTL = 120;
const PAIR_ATTEMPTS = 3;
const DIGITS_CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 原型里用系统语音模拟耳机播报；正式版由主机经耳机输出 */
const speakCode = (deviceId: string, code: string) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const digits = code.split("").map((d) => DIGITS_CN[Number(d)]).join("，");
  const utter = new SpeechSynthesisUtterance(
    `${deviceId}，配对码，${digits}，重复一遍，${digits}`,
  );
  utter.lang = "zh-CN";
  utter.rate = 0.85;
  window.speechSynthesis.speak(utter);
};

/** 2026-11-19 19:19 → 20261119-1919 */
const defaultName = (stamp: string) => {
  const d = stamp.replace(/\D/g, "");
  return `${d.slice(0, 8)}-${d.slice(8, 12)}`;
};

const nowStamp = (d = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const Card = styled("section")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  maxWidth: 620,
  minWidth: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 6,
  backgroundColor: HUD.panel,
}));

const StepBar = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 16px",
  borderBottom: `1px solid ${HUD.line}`,
});

const Step = styled("span")<{ $active: boolean }>(({ $active }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  letterSpacing: 1,
  color: $active ? HUD.cyan : HUD.textDim,
  "& > i": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 16,
    height: 16,
    borderRadius: "50%",
    border: `1px solid ${$active ? HUD.cyan : HUD.line}`,
    background: $active ? "rgba(63, 178, 255, 0.16)" : "transparent",
    fontStyle: "normal",
    fontSize: 10,
  },
}));

const StepLine = styled("span")({
  width: 22,
  height: 1,
  backgroundColor: HUD.line,
});

const Body = styled("div")({
  padding: "14px 16px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
});

const Field = styled("label")({
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 12,
  letterSpacing: 1,
  color: HUD.textDim,
});

const Input = styled("input")({
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  height: 32,
  padding: "0 10px",
  borderRadius: 4,
  border: `1px solid ${HUD.line}`,
  background: "rgba(4, 9, 15, 0.8)",
  color: HUD.text,
  fontSize: 13,
  outline: "none",
  "&:focus": { borderColor: HUD.lineStrong },
});

const Select = styled("select")({
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  height: 32,
  padding: "0 8px",
  borderRadius: 4,
  border: `1px solid ${HUD.line}`,
  background: "rgba(4, 9, 15, 0.8)",
  color: HUD.text,
  fontSize: 13,
  outline: "none",
  "&:focus": { borderColor: HUD.lineStrong },
});

const TwoCol = styled("div")({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
});

const DeviceList = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "6px 8px",
  border: `1px solid ${HUD.line}`,
  borderRadius: 4,
  background: "rgba(4, 9, 15, 0.5)",
});

const DeviceRow = styled("label")<{ $off: boolean }>(({ $off }) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 4px",
  borderRadius: 3,
  fontSize: 13,
  color: $off ? HUD.textDim : HUD.text,
  cursor: $off ? "not-allowed" : "pointer",
  "&:hover": { backgroundColor: $off ? "transparent" : "rgba(63, 178, 255, 0.08)" },
  "& input[type='checkbox']": { accentColor: HUD.cyan, width: 14, height: 14, margin: 0 },
}));

const Dot = styled("span")<{ $on: boolean }>(({ $on }) => ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  backgroundColor: $on ? HUD.ok : HUD.textDim,
  boxShadow: $on ? `0 0 6px ${HUD.ok}` : "none",
}));

const PairStart = styled("button")<{ $ghost?: boolean }>(({ $ghost }) => ({
  marginLeft: "auto",
  padding: "2px 9px",
  borderRadius: 3,
  fontSize: 11,
  letterSpacing: 1,
  border: `1px ${$ghost ? "dashed" : "solid"} ${$ghost ? "rgba(63, 178, 255, 0.35)" : HUD.cyan}`,
  background: $ghost ? "transparent" : "rgba(63, 178, 255, 0.12)",
  color: $ghost ? "rgba(63, 178, 255, 0.35)" : HUD.cyan,
  cursor: $ghost ? "default" : "pointer",
  "&:hover": $ghost ? {} : { background: "rgba(63, 178, 255, 0.22)" },
}));

const PairInline = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 5,
  marginLeft: "auto",
  flexShrink: 0,
});

const PairCodeInput = styled("input")({
  width: 72,
  height: 26,
  padding: "0 5px",
  boxSizing: "border-box",
  borderRadius: 3,
  border: `1px solid ${HUD.cyan}`,
  background: "rgba(4, 9, 15, 0.9)",
  color: HUD.cyan,
  fontSize: 13,
  fontFamily: '"Roboto Mono", "Consolas", monospace',
  letterSpacing: 4,
  textAlign: "center",
  outline: "none",
  "&::placeholder": { color: HUD.textDim, fontSize: 10, letterSpacing: 0.5 },
});

const PairCountdown = styled("span")({
  fontSize: 10,
  letterSpacing: 0.5,
  color: HUD.gold,
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
});

const Hint = styled("div")({
  fontSize: 11,
  letterSpacing: 0.5,
  color: HUD.textDim,
});

const AttachRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 10,
  "& > span": { fontSize: 11, color: HUD.textDim },
});

const AttachList = styled("div")({
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
});

const AttachItem = styled("span")({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 8px",
  borderRadius: 10,
  border: `1px solid ${HUD.line}`,
  fontSize: 11,
  color: HUD.text,
});

const AttachRemove = styled("button")({
  padding: 0,
  border: "none",
  background: "none",
  color: HUD.textDim,
  fontSize: 12,
  lineHeight: 1,
  cursor: "pointer",
  "&:hover": { color: HUD.danger },
});

const Footer = styled("div")({
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 16px 16px",
  borderTop: `1px solid ${HUD.line}`,
});

const Action = styled("button")<{ $primary?: boolean }>(({ $primary }) => ({
  minWidth: 88,
  height: 32,
  padding: "0 14px",
  borderRadius: 4,
  fontSize: 13,
  letterSpacing: 1,
  cursor: "pointer",
  border: `1px solid ${$primary ? HUD.cyan : HUD.line}`,
  background: $primary ? "rgba(63, 178, 255, 0.16)" : "transparent",
  color: $primary ? HUD.cyan : HUD.textDim,
  transition: "background-color 140ms ease, color 140ms ease, border-color 140ms ease",
  "&:hover": {
    borderColor: HUD.lineStrong,
    color: HUD.text,
    backgroundColor: $primary ? "rgba(63, 178, 255, 0.24)" : "rgba(63, 178, 255, 0.08)",
  },
  "&:disabled": {
    opacity: 0.4,
    cursor: "not-allowed",
  },
}));

const ConfirmList = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  border: `1px solid ${HUD.line}`,
  borderRadius: 4,
  background: "rgba(4, 9, 15, 0.5)",
});

const ConfirmRow = styled("div")({
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  fontSize: 13,
  color: HUD.text,
  "& > span:last-of-type": { textAlign: "right" },
});

const ConfirmLabel = styled("span")({
  flexShrink: 0,
  color: HUD.textDim,
});

const ConfirmHint = styled("div")({
  fontSize: 11,
  letterSpacing: 0.5,
  color: HUD.textDim,
});

interface Pairing {
  code: string;
  expiresAt: number;
  attemptsLeft: number;
}

export default function NewTaskForm({
  devices,
  onCreate,
  onPaired,
}: NewTaskFormProps) {
  const { notify } = useNotification();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [hall, setHall] = useState("");
  const [batch, setBatch] = useState("B-1119");
  const [leader, setLeader] = useState("张三");
  const [clock, setClock] = useState(() => Date.now());
  const [deviceIds, setDeviceIds] = useState<string[]>(
    devices.filter((d) => d.online && d.paired).map((d) => d.id),
  );
  const [attachments, setAttachments] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [pairings, setPairings] = useState<Record<string, Pairing>>({});
  const [digits, setDigits] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());

  const pairingIds = Object.keys(pairings);
  /** 默认任务名称跟着真实时间走，下发确认时取点击那一刻 */
  const liveName = defaultName(nowStamp(new Date(clock)));
  const baseName = name.trim() || liveName;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pairingIds.length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [pairingIds.length]);

  const dropPairings = (ids: string[]) => {
    setPairings((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    setDigits((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  };

  /** 到期作废，按钮回到配对状态 */
  useEffect(() => {
    const expired = Object.keys(pairings).filter((id) => pairings[id].expiresAt <= now);
    if (expired.length === 0) return;
    dropPairings(expired);
    notify("配对码已过期，请重新配对", "error");
  }, [now, pairings, notify]);

  /** 设备掉线时退出配对，按钮随设备状态回到正常显示 */
  useEffect(() => {
    const gone = Object.keys(pairings).filter((id) => {
      const device = devices.find((d) => d.id === id);
      return !device || !device.online;
    });
    if (gone.length === 0) return;
    dropPairings(gone);
    notify("设备已离线，配对已取消", "error");
  }, [devices, pairings, notify]);

  const startPairing = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device || !device.online) return;
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const expiresAt = Date.now() + PAIR_TTL * 1000;
    setPairings((prev) => ({
      ...prev,
      [deviceId]: { code, expiresAt, attemptsLeft: PAIR_ATTEMPTS },
    }));
    setDigits((prev) => ({ ...prev, [deviceId]: "" }));
    setNow(Date.now());
    speakCode(deviceId, code);
    notify(`配对码已通过 ${deviceId} 耳机播报`, "info");
  };

  const verifyCode = (deviceId: string, value: string) => {
    const pairing = pairings[deviceId];
    if (!pairing) return;
    if (value === pairing.code) {
      dropPairings([deviceId]);
      setDeviceIds((prev) => (prev.includes(deviceId) ? prev : [...prev, deviceId]));
      onPaired(deviceId);
      notify(`${deviceId} 配对成功`, "success");
      return;
    }
    const left = pairing.attemptsLeft - 1;
    if (left <= 0) {
      dropPairings([deviceId]);
      notify("配对码已作废，需重新配对", "error");
    } else {
      setPairings((prev) => ({
        ...prev,
        [deviceId]: { ...prev[deviceId], attemptsLeft: left },
      }));
      setDigits((prev) => ({ ...prev, [deviceId]: "" }));
      notify(`配对码错误，还剩 ${left} 次机会`, "error");
    }
  };

  const handleDigits = (deviceId: string, raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, 4);
    setDigits((prev) => ({ ...prev, [deviceId]: next }));
    if (next.length === 4) verifyCode(deviceId, next);
  };

  const toggleDevice = (id: string, selectable: boolean) => {
    if (!selectable) return;
    setDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const reset = () => {
    setStep("form");
    setName("");
    setSite("");
    setHall("");
    setBatch("B-1119");
    setLeader("张三");
    setDeviceIds(devices.filter((d) => d.online && d.paired).map((d) => d.id));
    setAttachments([]);
    setNote("");
    setPairings({});
    setDigits({});
  };

  const submit = () => {
    onCreate({
      name: name.trim() || defaultName(nowStamp()),
      site,
      hall,
      batch,
      leader,
      deviceIds,
      note,
      attachments,
    });
  };

  return (
    <Card>
      <StepBar>
        <Step $active={step === "form"}>
          <i>1</i>填写信息
        </Step>
        <StepLine />
        <Step $active={step === "confirm"}>
          <i>2</i>下发确认
        </Step>
      </StepBar>

      {step === "form" ? (
        <>
          <Body>
            <TwoCol>
              <Field>
                <span>场区</span>
                <Select value={site} onChange={(e) => setSite(e.target.value)}>
                  <option value="" disabled>请选择场区</option>
                  {SITES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field>
                <span>栋舍</span>
                <Select value={hall} onChange={(e) => setHall(e.target.value)}>
                  <option value="" disabled>请选择栋舍</option>
                  {HALLS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </Select>
              </Field>
            </TwoCol>

            <TwoCol>
              <Field>
                <span>批次</span>
                <Input
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  placeholder="如 B-1119"
                />
              </Field>
              <Field>
                <span>任务负责人</span>
                <Input value={leader} onChange={(e) => setLeader(e.target.value)} />
              </Field>
            </TwoCol>

            <Field>
              <span>任务名称</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={liveName}
              />
            </Field>

            <Field as="div">
              <span>参与设备</span>
              <DeviceList>
                {devices.map((d) => {
                  const selectable = d.online && d.paired;
                  const pairing = pairings[d.id];
                  return (
                    <DeviceRow key={d.id} $off={!selectable}>
                      <input
                        type="checkbox"
                        checked={deviceIds.includes(d.id)}
                        disabled={!selectable}
                        onChange={() => toggleDevice(d.id, selectable)}
                      />
                      <Dot $on={d.online} />
                      <span>{d.id}</span>
                      {!d.online ? (
                        <PairStart $ghost type="button" tabIndex={-1} aria-disabled="true">
                          配对
                        </PairStart>
                      ) : pairing ? (
                        <PairInline>
                          <PairCodeInput
                            value={digits[d.id] ?? ""}
                            onChange={(e) => handleDigits(d.id, e.target.value)}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={4}
                            aria-label={`${d.id} 配对码`}
                            placeholder="4 位码"
                            autoFocus
                          />
                          <PairCountdown>
                            （{Math.max(0, Math.ceil((pairing.expiresAt - now) / 1000))} 秒失效）
                          </PairCountdown>
                        </PairInline>
                      ) : d.paired ? (
                        <span style={{ marginLeft: "auto", fontSize: 11, color: HUD.textDim }}>
                          在线
                        </span>
                      ) : (
                        <PairStart
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            startPairing(d.id);
                          }}
                        >
                          配对
                        </PairStart>
                      )}
                    </DeviceRow>
                  );
                })}
              </DeviceList>
              {deviceIds.length === 0 && <Hint>至少选择一台在线设备</Hint>}
              <Hint>
                设备需与主机处于同一局域网；蓝色「配对」表示在线可配，可同时配对多台，配对成功后显示在线。
              </Hint>
            </Field>

            <Field as="div">
              <span>附件</span>
              <AttachRow>
                <Action type="button" onClick={() => fileRef.current?.click()}>
                  选择文件
                </Action>
                <span>{attachments.length ? `已选 ${attachments.length} 个` : "批次资料、作业单、现场照片"}</span>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const names = Array.from(e.target.files ?? []).map((f) => f.name);
                    setAttachments((prev) => Array.from(new Set([...prev, ...names])));
                    e.target.value = "";
                  }}
                />
              </AttachRow>
              {attachments.length > 0 && (
                <AttachList>
                  {attachments.map((name) => (
                    <AttachItem key={name}>
                      {name}
                      <AttachRemove
                        type="button"
                        aria-label={`移除 ${name}`}
                        onClick={() => setAttachments((prev) => prev.filter((n) => n !== name))}
                      >
                        ×
                      </AttachRemove>
                    </AttachItem>
                  ))}
                </AttachList>
              )}
            </Field>

            <Field>
              <span>备注</span>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="选填"
              />
            </Field>
          </Body>
          <Footer>
            <Action type="button" onClick={reset}>重置</Action>
            <Action
              type="button"
              $primary
              disabled={!site || !hall || deviceIds.length === 0}
              onClick={() => setStep("confirm")}
            >
              下一步
            </Action>
          </Footer>
        </>
      ) : (
        <>
          <Body>
            <ConfirmList>
              <ConfirmRow>
                <ConfirmLabel>任务名称</ConfirmLabel>
                <span>
                  {deviceIds
                    .map((id) => `${baseName}-${id.split("-").pop()}`)
                    .join("、")}
                </span>
              </ConfirmRow>
              <ConfirmRow>
                <ConfirmLabel>场区 / 批次</ConfirmLabel>
                <span>{site} · {batch}</span>
              </ConfirmRow>
              <ConfirmRow>
                <ConfirmLabel>负责人</ConfirmLabel>
                <span>{leader}</span>
              </ConfirmRow>
              <ConfirmRow>
                <ConfirmLabel>加入设备</ConfirmLabel>
                <span>{deviceIds.join("、")}</span>
              </ConfirmRow>
              {attachments.length > 0 && (
                <ConfirmRow>
                  <ConfirmLabel>附件</ConfirmLabel>
                  <span>{attachments.join("、")}</span>
                </ConfirmRow>
              )}
              {note && (
                <ConfirmRow>
                  <ConfirmLabel>备注</ConfirmLabel>
                  <span>{note}</span>
                </ConfirmRow>
              )}
            </ConfirmList>
            <ConfirmHint>确认后仅把设备并入当前任务，当前任务继续运行、不会停止。</ConfirmHint>
          </Body>
          <Footer>
            <Action type="button" onClick={() => setStep("form")}>返回修改</Action>
            <Action type="button" $primary onClick={submit}>确认下发</Action>
          </Footer>
        </>
      )}
    </Card>
  );
}