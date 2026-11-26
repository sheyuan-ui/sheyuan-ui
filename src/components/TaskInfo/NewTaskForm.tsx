import { useEffect, useRef, useState } from "react";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import AttachmentDialog, { type Attachment } from "./AttachmentPreview";

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
  scene: string;
  batch: string;
  leader: string;
  date: string;
  location: string;
  deviceIds: string[];
  note: string;
  attachments: Attachment[];
}

interface NewTaskFormProps {
  devices: DeviceOption[];
  /** 当前任务正在使用的设备 */
  runningIds?: string[];
  onCreate: (input: NewTaskInput) => void;
}

const SITES = ["1号场区", "2号场区", "3号场区"];
const HALLS = ["1号栋", "2号栋", "3号栋", "4号栋"];
const SCENES = ["蛋鸡", "肉鸡"];

/** 2026-11-19 19:19 → 20261119-1919 */
const defaultName = (stamp: string) => {
  const d = stamp.replace(/\D/g, "");
  return `${d.slice(0, 8)}-${d.slice(8, 12)}`;
};

const nowStamp = (d = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const todayValue = (d = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const defaultSelection = (devices: DeviceOption[]) =>
  devices.filter((d) => d.online && d.paired).map((d) => d.id);

const Card = styled("section")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  maxWidth: 620,
  minWidth: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 6,
  backgroundColor: HUD.panel,
}));

const Body = styled("div")({
  padding: "16px 16px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
});

const Field = styled("label")({
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 0,
  fontSize: 12,
  letterSpacing: 1,
  color: HUD.textDim,
});

const Req = styled("i")({
  fontStyle: "normal",
  marginLeft: 3,
  color: HUD.gold,
});

const Optional = styled("i")({
  fontStyle: "normal",
  marginLeft: 3,
  fontSize: 10,
  letterSpacing: 0.5,
  color: HUD.textDim,
  opacity: 0.8,
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
  colorScheme: "dark",
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
  colorScheme: "dark",
  "&:focus": { borderColor: HUD.lineStrong },
});

const TwoCol = styled("div")({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  "@media (max-width: 480px)": { gridTemplateColumns: "1fr" },
});

const PickerWrap = styled("div")({
  position: "relative",
  minWidth: 0,
});

const PickerTrigger = styled("button")<{ $open: boolean }>(({ $open }) => ({
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 5,
  padding: "4px 10px",
  borderRadius: 4,
  border: `1px solid ${$open ? HUD.lineStrong : HUD.line}`,
  background: "rgba(4, 9, 15, 0.8)",
  color: HUD.text,
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
  "&:hover": { borderColor: HUD.lineStrong },
  "&:disabled": {
    cursor: "not-allowed",
    opacity: 0.7,
    "&:hover": { borderColor: HUD.line },
  },
}));

const TriggerText = styled("span")({
  fontSize: 12,
  color: HUD.textDim,
});

const Chip = styled("span")({
  display: "inline-flex",
  alignItems: "center",
  height: 21,
  padding: "0 8px",
  borderRadius: 11,
  border: `1px solid rgba(63, 178, 255, 0.35)`,
  backgroundColor: "rgba(63, 178, 255, 0.08)",
  fontSize: 11,
  letterSpacing: 0.3,
  color: HUD.text,
});

const Caret = styled("span")<{ $open: boolean }>(({ $open }) => ({
  marginLeft: "auto",
  flexShrink: 0,
  fontSize: 9,
  color: HUD.textDim,
  transform: $open ? "rotate(180deg)" : "none",
  transition: "transform 140ms ease",
}));

const PickerPanel = styled("div")({
  position: "absolute",
  zIndex: 20,
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  maxHeight: 236,
  overflowY: "auto",
  padding: 6,
  borderRadius: 5,
  border: `1px solid ${HUD.line}`,
  backgroundColor: HUD.panelSoft,
  boxShadow: "0 14px 30px rgba(0, 0, 0, 0.55)",
});

const PickerRow = styled("label")<{ $off: boolean }>(({ $off }) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 6px",
  borderRadius: 3,
  fontSize: 13,
  color: $off ? HUD.textDim : HUD.text,
  cursor: $off ? "not-allowed" : "pointer",
  "&:hover": { backgroundColor: $off ? "transparent" : "rgba(63, 178, 255, 0.08)" },
  "& input[type='checkbox']": {
    accentColor: HUD.cyan,
    width: 14,
    height: 14,
    margin: 0,
    flexShrink: 0,
  },
}));

const RowName = styled("span")({
  display: "flex",
  flexDirection: "column",
  gap: 1,
  minWidth: 0,
  "& > i": {
    fontStyle: "normal",
    fontSize: 10,
    letterSpacing: 0.3,
    color: HUD.textDim,
  },
});

const RowState = styled("span")<{ $on: boolean }>(({ $on }) => ({
  marginLeft: "auto",
  flexShrink: 0,
  fontSize: 10,
  letterSpacing: 0.5,
  color: $on ? HUD.ok : HUD.textDim,
}));

const Dot = styled("span")<{ $on: boolean }>(({ $on }) => ({
  width: 6,
  height: 6,
  flexShrink: 0,
  borderRadius: "50%",
  backgroundColor: $on ? HUD.ok : HUD.textDim,
  boxShadow: $on ? `0 0 6px ${HUD.ok}` : "none",
}));

const Hint = styled("div")({
  fontSize: 11,
  letterSpacing: 0.5,
  color: HUD.textDim,
});

const Warn = styled("div")({
  fontSize: 11,
  letterSpacing: 0.5,
  color: HUD.gold,
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
  gap: 2,
  padding: "2px 4px 2px 8px",
  borderRadius: 10,
  border: `1px solid ${HUD.line}`,
  fontSize: 11,
  color: HUD.text,
});

/** 点击附件名打开预览 */
const AttachOpen = styled("button")({
  padding: "2px 4px",
  border: "none",
  background: "none",
  color: HUD.text,
  font: "inherit",
  cursor: "pointer",
  borderRadius: 4,
  "&:hover": { color: HUD.cyan, backgroundColor: "rgba(63, 178, 255, 0.10)" },
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

export default function NewTaskForm({
  devices,
  runningIds = [],
  onCreate,
}: NewTaskFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [hall, setHall] = useState("");
  const [scene, setScene] = useState("");
  const [batch, setBatch] = useState("B-1119");
  const [leader, setLeader] = useState("张三");
  const [date, setDate] = useState(todayValue);
  const [location, setLocation] = useState("");
  const [deviceIds, setDeviceIds] = useState<string[]>(() => defaultSelection(devices));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [note, setNote] = useState("");

  const pairedDevices = devices.filter((d) => d.paired);
  const liveName = defaultName(nowStamp());
  /** 未勾选的运行中设备不属于本次下发，保持原任务继续运行 */
  const continued = runningIds.filter((id) => !deviceIds.includes(id));

  /** 配对页接入新设备后，把可参与设备并入已选，避免表单停留在旧勾选而漏掉已运行设备 */
  const deviceSig = devices.map((d) => `${d.id}:${d.online}:${d.paired}`).join("|");
  const lastSig = useRef(deviceSig);

  useEffect(() => {
    if (lastSig.current === deviceSig) return;
    lastSig.current = deviceSig;
    setDeviceIds((prev) => {
      const next = [...prev];
      defaultSelection(devices).forEach((id) => {
        if (!next.includes(id)) next.push(id);
      });
      return next;
    });
  }, [deviceSig, devices]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const toggleDevice = (id: string) => {
    setDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const reset = () => {
    setName("");
    setSite("");
    setHall("");
    setScene("");
    setBatch("B-1119");
    setLeader("张三");
    setDate(todayValue());
    setLocation("");
    setDeviceIds(defaultSelection(devices));
    setPickerOpen(false);
    attachments.forEach((a) => a.url && URL.revokeObjectURL(a.url));
    setAttachments([]);
    setPreview(null);
    setNote("");
  };

  const submit = () => {
    onCreate({
      name: name.trim() || defaultName(nowStamp()),
      site,
      hall,
      scene,
      batch: batch.trim(),
      leader: leader.trim(),
      date,
      location: location.trim(),
      deviceIds,
      note: note.trim(),
      attachments,
    });
  };

  const canSubmit =
    Boolean(site) &&
    Boolean(hall) &&
    Boolean(batch.trim()) &&
    Boolean(leader.trim()) &&
    Boolean(date) &&
    deviceIds.length > 0;

  return (
    <Card>
      <Body>
        <TwoCol>
          <Field>
            <span>场区<Req>*</Req></span>
            <Select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="" disabled>请选择场区</option>
              {SITES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <span>栋舍<Req>*</Req></span>
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
            <span>场景<Optional>（可选）</Optional></span>
            <Select value={scene} onChange={(e) => setScene(e.target.value)}>
              <option value="">不指定</option>
              {SCENES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <span>批次<Req>*</Req></span>
            <Input
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="如 B-1119"
            />
          </Field>
        </TwoCol>

        <TwoCol>
          <Field>
            <span>负责人<Req>*</Req></span>
            <Input value={leader} onChange={(e) => setLeader(e.target.value)} />
          </Field>
          <Field>
            <span>作业日期<Req>*</Req></span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
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
          <span>参与设备<Req>*</Req></span>
          <PickerWrap ref={pickerRef}>
            <PickerTrigger
              type="button"
              $open={pickerOpen}
              disabled={pairedDevices.length === 0}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              aria-label="选择参与设备（可多选）"
              onClick={() => setPickerOpen((v) => !v)}
            >
              {deviceIds.length > 0 ? (
                deviceIds.map((id) => <Chip key={id}>{id}</Chip>)
              ) : (
                <TriggerText>
                  {pairedDevices.length > 0 ? "点击选择已配对设备" : "暂无已配对设备"}
                </TriggerText>
              )}
              <Caret $open={pickerOpen}>▾</Caret>
            </PickerTrigger>

            {pickerOpen && pairedDevices.length > 0 && (
              <PickerPanel role="listbox" aria-multiselectable="true">
                {pairedDevices.map((d) => (
                  <PickerRow key={d.id} $off={!d.online}>
                    <input
                      type="checkbox"
                      checked={deviceIds.includes(d.id)}
                      disabled={!d.online}
                      onChange={() => d.online && toggleDevice(d.id)}
                    />
                    <Dot $on={d.online} />
                    <RowName>
                      <span>{d.id}</span>
                      {d.alias && <i>{d.alias}</i>}
                    </RowName>
                    <RowState $on={d.online}>
                      {!d.online ? "离线" : runningIds.includes(d.id) ? "运行中" : "在线"}
                    </RowState>
                  </PickerRow>
                ))}
              </PickerPanel>
            )}
          </PickerWrap>
          {deviceIds.length === 0 ? (
            <Warn>
              {pairedDevices.length > 0
                ? "至少选择一台在线设备"
                : "暂无已配对设备，请先在顶栏「设备配对」中接入"}
            </Warn>
          ) : (
            <Hint>仅已配对且在线的设备可参与任务；离线设备恢复在线后可再选。</Hint>
          )}
          {continued.length > 0 && (
            <Hint>
              未勾选的运行中设备 {continued.join("、")}：保持原任务继续运行，不受本次下发影响。
            </Hint>
          )}
        </Field>

        <Field>
          <span>经纬度<Optional>（可选）</Optional></span>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="如 31.2304, 121.4737"
          />
        </Field>

        <Field>
          <span>备注</span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="选填"
          />
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
                const picked = Array.from(e.target.files ?? []).map<Attachment>((f) => ({
                  name: f.name,
                  url: URL.createObjectURL(f),
                  mime: f.type,
                }));
                setAttachments((prev) => {
                  const known = new Set(prev.map((a) => a.name));
                  picked.forEach((a) => {
                    if (known.has(a.name) && a.url) URL.revokeObjectURL(a.url);
                  });
                  return [...prev, ...picked.filter((a) => !known.has(a.name))];
                });
                e.target.value = "";
              }}
            />
          </AttachRow>
          {attachments.length > 0 && (
            <AttachList>
              {attachments.map((file) => (
                <AttachItem key={file.name}>
                  <AttachOpen
                    type="button"
                    title="查看附件"
                    onClick={() => setPreview(file)}
                  >
                    {file.name}
                  </AttachOpen>
                  <AttachRemove
                    type="button"
                    aria-label={`移除 ${file.name}`}
                    onClick={() => {
                      if (file.url) URL.revokeObjectURL(file.url);
                      setAttachments((prev) => prev.filter((a) => a.name !== file.name));
                      setPreview((current) => (current?.name === file.name ? null : current));
                    }}
                  >
                    ×
                  </AttachRemove>
                </AttachItem>
              ))}
            </AttachList>
          )}
        </Field>
      </Body>

      <Footer>
        <Action type="button" onClick={reset}>重置</Action>
        <Action type="button" $primary disabled={!canSubmit} onClick={submit}>
          确认并下发
        </Action>
      </Footer>

      <AttachmentDialog attachment={preview} onClose={() => setPreview(null)} />
    </Card>
  );
}