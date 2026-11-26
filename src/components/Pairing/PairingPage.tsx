import { useEffect, useMemo, useRef, useState } from "react";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { useNotification } from "../../contexts/NotificationContext";
import type { DeviceOption } from "../TaskInfo/NewTaskForm";
import type { DeviceCodeEntry } from "../../deviceCodes";

const MONO = '"Roboto Mono", "Consolas", monospace';

/** 设备型号信息（联调前为演示数据） */
const DEVICE_META: Record<string, { model: string; firmware: string }> = {
  "头盔-01": { model: "SY-Helmet Edge", firmware: "v1.4.2" },
  "头盔-02": { model: "SY-Helmet Edge", firmware: "v1.4.2" },
  "头盔-03": { model: "SY-Helmet Edge", firmware: "v1.4.0" },
  "头盔-04": { model: "SY-Helmet Edge", firmware: "v1.3.9" },
};

const metaOf = (id: string) =>
  DEVICE_META[id] ?? { model: "SY-Helmet Edge", firmware: "--" };

/** 现场网络：连接设备前切到头盔热点 */
const NETWORKS = [
  { name: "SY-FIELD-A", signal: "-52dBm", ip: "192.168.1.31", gateway: "192.168.1.1" },
  { name: "AP 模式（头盔热点）", signal: "—", ip: "192.168.4.1", gateway: "192.168.4.1" },
];

const gatewayTail = (ip: string) => `.${ip.split(".").pop()}`;

const Page = styled("div")(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  backgroundColor: theme.palette.background.default,
  padding: "18px 22px 28px",
  "@media (max-width: 720px)": { padding: "14px 12px 22px" },
}));

const Shell = styled("div")({
  width: "100%",
  maxWidth: 1320,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
});

const PageHead = styled("div")({
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  "& h1": {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: 0.3,
    color: HUD.text,
  },
  "& p": {
    margin: "5px 0 0",
    fontSize: 11,
    letterSpacing: 0.2,
    color: HUD.textDim,
    "& b": {
      fontFamily: MONO,
      fontWeight: 500,
      color: HUD.text,
      letterSpacing: 0.4,
    },
  },
});

const Grid = styled("div")({
  display: "grid",
  gridTemplateColumns: "minmax(0, 460px) minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
  "@media (max-width: 860px)": { gridTemplateColumns: "1fr" },
});

const Panel = styled("section")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
  overflow: "hidden",
}));

const PanelHead = styled("div")({
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "9px 13px",
  borderBottom: `1px solid ${HUD.lineSoft}`,
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  color: HUD.text,
});

const PanelNote = styled("span")({
  marginLeft: "auto",
  minWidth: 0,
  fontSize: 10.5,
  fontWeight: 400,
  letterSpacing: 0.2,
  color: HUD.textDim,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const PanelBody = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: "14px 13px 16px",
});

const FieldLabel = styled("span")({
  fontSize: 10.5,
  letterSpacing: 0.3,
  color: HUD.textDim,
});

const FieldHint = styled("span")({
  display: "block",
  marginTop: 3,
  fontSize: 10.5,
  letterSpacing: 0.2,
  color: HUD.textDim,
  opacity: 0.8,
});

const AddrRow = styled("div")({
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  minWidth: 0,
  fontSize: 11,
  "& > span": { flexShrink: 0, color: HUD.textDim, letterSpacing: 0.2 },
  "& > b": {
    minWidth: 0,
    fontFamily: MONO,
    fontSize: 11.5,
    fontWeight: 500,
    color: HUD.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
});

const NetRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 5,
  "& > b": {
    fontFamily: MONO,
    fontSize: 12.5,
    fontWeight: 500,
    letterSpacing: 0.2,
    color: HUD.text,
    whiteSpace: "nowrap",
  },
});

const NetMeta = styled("span")({
  fontFamily: MONO,
  fontSize: 10.5,
  color: HUD.textDim,
  whiteSpace: "nowrap",
});

const BtnRow = styled("div")({
  display: "flex",
  gap: 8,
  marginTop: 2,
});

const Btn = styled("button")<{ $primary?: boolean; $wide?: boolean }>(
  ({ $primary, $wide }) => ({
    height: $wide ? 36 : 32,
    width: $wide ? "100%" : undefined,
    padding: "0 14px",
    borderRadius: 5,
    border: `1px solid ${$primary ? "rgba(63, 178, 255, 0.4)" : HUD.lineSoft}`,
    background: $primary ? "rgba(63, 178, 255, 0.12)" : "transparent",
    color: $primary ? HUD.cyan : HUD.textDim,
    fontSize: 12,
    letterSpacing: $wide ? 2 : 0.4,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background-color 160ms ease, color 160ms ease, border-color 160ms ease",
    "&:hover": {
      borderColor: $primary ? "rgba(63, 178, 255, 0.6)" : "rgba(126, 162, 205, 0.28)",
      color: $primary ? HUD.cyan : HUD.text,
      backgroundColor: $primary ? "rgba(63, 178, 255, 0.18)" : "rgba(255, 255, 255, 0.04)",
    },
    "&:disabled": { opacity: 0.45, cursor: "default" },
  }),
);

const DeviceRow = styled("div")<{ $off?: boolean }>(({ $off }) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "9px 13px",
  borderTop: `1px solid ${HUD.lineSoft}`,
  "&:first-of-type": { borderTop: "none" },
  opacity: $off ? 0.6 : 1,
}));

const Dot = styled("span")<{ $on: boolean }>(({ $on }) => ({
  width: 6,
  height: 6,
  flexShrink: 0,
  borderRadius: "50%",
  backgroundColor: $on ? HUD.ok : HUD.textDim,
  boxShadow: $on ? `0 0 6px ${HUD.ok}` : "none",
}));

const RowName = styled("span")({
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  minWidth: 0,
  flexWrap: "wrap",
  "& > b": {
    fontFamily: MONO,
    fontSize: 12.5,
    fontWeight: 500,
    letterSpacing: 0.3,
    color: HUD.text,
    whiteSpace: "nowrap",
  },
});

const RowActions = styled("span")({
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginLeft: "auto",
  flexShrink: 0,
});

/** 设备码：设备端返回、与 PAD 设备码库比对 */
const RowCode = styled("span")({
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: 0.3,
  color: HUD.textDim,
});

const StateTag = styled("span")({
  display: "inline-flex",
  alignItems: "center",
  height: 20,
  padding: "0 8px",
  borderRadius: 10,
  border: `1px solid ${HUD.lineSoft}`,
  fontSize: 10,
  letterSpacing: 0.3,
  color: HUD.textDim,
  whiteSpace: "nowrap",
});

const UnpairBtn = styled("button")({
  height: 26,
  padding: "0 8px",
  border: "none",
  background: "transparent",
  color: HUD.textDim,
  fontSize: 11,
  letterSpacing: 0.3,
  cursor: "pointer",
  whiteSpace: "nowrap",
  "&:hover": { color: HUD.danger },
});

const ConnectedTag = styled("span")({
  display: "inline-flex",
  alignItems: "center",
  height: 20,
  padding: "0 8px",
  borderRadius: 10,
  border: `1px solid ${HUD.ok}40`,
  backgroundColor: `${HUD.ok}0f`,
  fontSize: 10,
  letterSpacing: 0.3,
  color: HUD.ok,
  whiteSpace: "nowrap",
});

const ResultBody = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minHeight: 196,
  padding: "16px 13px 16px",
});

const ResultPlaceholder = styled("div")({
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  border: `1px dashed ${HUD.lineSoft}`,
  padding: "0 18px",
  textAlign: "center",
  fontSize: 11,
  lineHeight: 1.8,
  color: HUD.textDim,
});

const NoticeBox = styled("div")<{ $tone: "danger" | "ok" }>(({ $tone }) => {
  const color = $tone === "danger" ? HUD.danger : HUD.ok;
  return {
    padding: "9px 11px",
    borderRadius: 6,
    border: `1px solid ${color}38`,
    backgroundColor: `${color}0d`,
    fontSize: 11,
    lineHeight: 1.7,
    color: HUD.text,
    "& b": { marginRight: 6, fontWeight: 600, color },
  };
});

const ResultHead = styled("div")({
  fontSize: 10.5,
  letterSpacing: 0.3,
  color: HUD.textDim,
  "& b": {
    fontFamily: MONO,
    fontWeight: 500,
    color: HUD.text,
    fontVariantNumeric: "tabular-nums",
  },
});

const ResultList = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 6,
  overflow: "hidden",
}));

const ResultRow = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  padding: "9px 11px",
  borderTop: `1px solid ${HUD.lineSoft}`,
  "&:first-of-type": { borderTop: "none" },
  "& > b": {
    fontFamily: MONO,
    fontSize: 12.5,
    fontWeight: 500,
    letterSpacing: 0.3,
    color: HUD.text,
  },
});

const ResultMeta = styled("span")({
  fontFamily: MONO,
  fontSize: 10.5,
  color: HUD.textDim,
  whiteSpace: "nowrap",
});

const ResultTag = styled(ConnectedTag)({
  marginLeft: "auto",
});

const ConnectingLine = styled("div")({
  fontSize: 11,
  letterSpacing: 0.3,
  color: HUD.textDim,
});

const HintList = styled("div")({
  fontSize: 10.5,
  lineHeight: 1.9,
  letterSpacing: 0.2,
  color: HUD.textDim,
});

const MetaLine = styled("div")({
  fontSize: 10.5,
  letterSpacing: 0.3,
  color: HUD.textDim,
});

interface PairingPageProps {
  /** 全局设备注册表；已配对即视为已连接 */
  devices: DeviceOption[];
  /** 管理员在设置页维护的设备码库，配对只认库内设备码 */
  codes: DeviceCodeEntry[];
  /** 连接成功：把设备标记为已配对，状态由全局维护 */
  onPaired: (id: string) => void;
  /** 取消配对：设备回到可重新配对状态 */
  onUnpaired: (id: string) => void;
  /** 打开任务信息的新建任务 */
  onCreateTask: () => void;
}

export default function PairingPage({
  devices,
  codes,
  onPaired,
  onUnpaired,
  onCreateTask,
}: PairingPageProps) {
  const { notify } = useNotification();
  /** 扫描识别状态：目标设备、最近一次识别结果、无可用设备 */
  const [scanning, setScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [scanDone, setScanDone] = useState<{ id: string; code: string } | null>(null);
  const [scanEmpty, setScanEmpty] = useState(false);
  const scanTimer = useRef<number | null>(null);
  const connectedIds = useMemo(
    () => devices.filter((d) => d.paired).map((d) => d.id),
    [devices],
  );
  /** 库内设备码；未登记的设备显示「未登记」且无法配对 */
  const codeFor = (id: string) =>
    codes.find((c) => c.id === id)?.code ?? "未登记";
  /** 现场网络：现场 Wi-Fi 与管理服务通信，头盔热点用于识别设备 */
  const [networkIndex, setNetworkIndex] = useState(0);
  const network = NETWORKS[networkIndex];
  const alternate = NETWORKS[(networkIndex + 1) % NETWORKS.length];
  const switchNetwork = () => {
    const next = (networkIndex + 1) % NETWORKS.length;
    setNetworkIndex(next);
    notify(`已切换到 ${NETWORKS[next].name}`, "success");
  };

  useEffect(
    () => () => {
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    },
    [],
  );

  /** PAD 识别设备热点 → 读取设备返回的设备码 → 在设备码库中校验通过后连接 */
  const scanAndConnect = () => {
    if (scanning) return;
    const candidates = devices.filter((d) => d.online && !d.paired);
    const target = candidates.find((d) => codes.some((c) => c.id === d.id));
    const code = target ? (codes.find((c) => c.id === target.id)?.code ?? null) : null;
    setScanDone(null);
    setScanEmpty(false);
    if (!target || !code) {
      setScanEmpty(true);
      notify(
        candidates.length > 0
          ? "识别到的设备码均不在库中，请先在「设置」登记"
          : "未发现待连接的设备热点",
        "error",
      );
      return;
    }
    setScanning(true);
    setScanTarget(target.id);
    scanTimer.current = window.setTimeout(() => {
      onPaired(target.id);
      setScanning(false);
      setScanTarget(null);
      setScanDone({ id: target.id, code });
      notify(`${target.id} 设备码校验通过，已连接`, "success");
    }, 900);
  };

  const unpair = (deviceId: string) => {
    if (scanDone?.id === deviceId) setScanDone(null);
    onUnpaired(deviceId);
    notify(`${deviceId} 已取消配对`, "info");
  };

  return (
    <Page>
      <Shell>
        <PageHead>
          <div>
            <h1>设备连接与配对</h1>
            <p>
              PAD 识别设备热点并读回设备码，与设备码库比对通过后建立连接；新设备请先由管理员在「设置」登记。
            </p>
          </div>
        </PageHead>

        <Panel>
          <PanelHead>
            已注册设备
            <PanelNote>共 {devices.length} 台</PanelNote>
            <Btn
              type="button"
              $primary
              onClick={scanAndConnect}
              disabled={scanning}
              style={{ height: 28, padding: "0 12px", marginLeft: 10 }}
            >
              {scanning ? "识别中…" : "扫描热点并连接"}
            </Btn>
          </PanelHead>
          {devices.map((device) => {
            const connected = device.paired;
            const checking = scanning && scanTarget === device.id;
            return (
              <DeviceRow key={device.id} $off={!device.online}>
                <Dot $on={device.online} />
                <RowName>
                  <b>{device.id}</b>
                  <RowCode>{codeFor(device.id)}</RowCode>
                </RowName>
                <RowActions>
                  {connected ? (
                    <>
                      <ConnectedTag>已连接</ConnectedTag>
                      <UnpairBtn type="button" onClick={() => unpair(device.id)}>
                        取消配对
                      </UnpairBtn>
                    </>
                  ) : checking ? (
                    <StateTag>校验设备码…</StateTag>
                  ) : (
                    <StateTag>{device.online ? "待识别" : "离线"}</StateTag>
                  )}
                </RowActions>
              </DeviceRow>
            );
          })}
        </Panel>

        <Grid>
          <Panel>
            <PanelHead>管理服务</PanelHead>
            <PanelBody>
              <div>
                <FieldLabel>现场网络</FieldLabel>
                <NetRow>
                  <b>
                    {network.signal === "—"
                      ? network.name
                      : `${network.name}（${network.signal}）`}
                  </b>
                  <NetMeta>
                    {network.ip} · 网关 {gatewayTail(network.gateway)}
                  </NetMeta>
                  <Btn
                    type="button"
                    style={{ marginLeft: "auto", height: 28, padding: "0 10px" }}
                    onClick={switchNetwork}
                  >
                    切换网络
                  </Btn>
                </NetRow>
                <FieldHint>
                  连接设备前切到「AP 模式（头盔热点）」，PAD 才能识别设备热点；备用 {alternate.name}
                </FieldHint>
              </div>

              <AddrRow>
                <span>服务地址</span>
                <b>http://192.168.31.20:8080</b>
              </AddrRow>
              <MetaLine>
                设备码库 {codes.length} 条 · 已连接 {connectedIds.length} 台
              </MetaLine>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead>连接结果</PanelHead>
            <ResultBody>
              {scanning && <ConnectingLine>正在识别热点并校验设备码…</ConnectingLine>}
              {scanEmpty && !scanning && (
                <NoticeBox $tone="danger">
                  <b>未发现设备</b>
                  请确认设备已上电并开启热点；未登记的设备请先由管理员在「设置」登记设备码。
                </NoticeBox>
              )}
              {scanDone && !scanning && (
                <NoticeBox $tone="ok">
                  <b>配对成功</b>
                  {scanDone.id} 返回设备码 {scanDone.code}，已在设备码库中匹配并建立连接。
                </NoticeBox>
              )}
              {connectedIds.length === 0 && !scanning && (
                <ResultPlaceholder>
                  尚未建立连接
                  <br />
                  识别到已登记的设备热点后自动连接
                </ResultPlaceholder>
              )}
              {connectedIds.length > 0 && (
                <>
                  <ResultHead>
                    已连接 <b>{connectedIds.length}</b> 台
                  </ResultHead>
                  <ResultList>
                    {connectedIds.map((id) => (
                      <ResultRow key={id}>
                        <b>{id}</b>
                        <ResultMeta>
                          {metaOf(id).model} · {metaOf(id).firmware}
                        </ResultMeta>
                        <ResultMeta>{codeFor(id)}</ResultMeta>
                        <ResultTag>已连接</ResultTag>
                      </ResultRow>
                    ))}
                  </ResultList>
                  <BtnRow>
                    <Btn type="button" $primary onClick={onCreateTask}>
                      新建任务
                    </Btn>
                  </BtnRow>
                </>
              )}

              <HintList>
                设备码不在库中不建立连接，请先由管理员在「设置」登记设备码 · 热点断开自动重连 · 服务不可达 502
              </HintList>
            </ResultBody>
          </Panel>
        </Grid>
      </Shell>
    </Page>
  );
}