import { useEffect, useMemo, useState } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { styled } from "@mui/material/styles";
import theme, { HUD } from "./theme/theme";
import AppBar from "./components/AppBar/AppBar";
import VideoPanel, { type CameraEye } from "./components/VideoPanel/VideoPanel";
import ViewerPanel from "./components/Viewer/ViewerPanel";
import DevicePage from "./components/DeviceStatus/DevicePage";
import PairingPage from "./components/Pairing/PairingPage";
import TaskInfoPage from "./components/TaskInfo/TaskInfoPage";
import SettingsPage from "./components/Settings/SettingsPage";
import type { DeviceOption } from "./components/TaskInfo/NewTaskForm";
import LoginPage from "./components/Login/LoginPage";
import { authApi, type AuthUser, type Role } from "./api";
import { USE_MOCK } from "./api/client";
import { useDevicesFeed } from "./api/useDevices";
import { NotificationProvider } from "./contexts/NotificationContext";
import { PlaybackProvider } from "./contexts/PlaybackContext";
import { loadCodes, saveCodes, type DeviceCodeEntry } from "./deviceCodes";

const AppContainer = styled("div")({
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  width: "100vw",
  overflow: "hidden",
});

/** 图片视图：左目 / 右目 / 手部图三栏等宽；双击放大时收成两栏等宽 */
const MediaRow = styled("div")({
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
});

const VideoColumn = styled("div")<{ $grow: number }>(({ $grow }) => ({
  display: "flex",
  flexDirection: "column",
  flexGrow: $grow,
  flexBasis: 0,
  minWidth: 0,
  minHeight: 0,
  transition: "flex-grow 320ms cubic-bezier(0.25, 0.8, 0.3, 1)",
}));

const ViewerColumn = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  flexBasis: 0,
  minWidth: 0,
  minHeight: 0,
  borderLeft: `1px solid ${theme.palette.divider}`,
}));

/** 无设备接入时的画面占位：保留左目 / 右目 / 手部图三块分区，明确告知无画面 */
const EmptyEyes = styled("div")({
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
});

const EmptyPane = styled("div")({
  position: "relative",
  display: "flex",
  flex: 1,
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minWidth: 0,
  minHeight: 0,
  padding: "0 12px",
  backgroundColor: "#04090f",
  textAlign: "center",
});

const EmptyTag = styled("span")({
  position: "absolute",
  top: 10,
  left: 12,
  padding: "1px 8px",
  borderRadius: 4,
  border: `1px solid ${HUD.lineSoft}`,
  backgroundColor: "rgba(4, 9, 15, 0.55)",
  fontSize: 10.5,
  letterSpacing: 0.8,
  color: HUD.textDim,
});

const EmptyTitle = styled("span")({
  fontSize: 13,
  letterSpacing: 2,
  color: HUD.textDim,
});

const EmptyHint = styled("span")({
  fontSize: 11,
  letterSpacing: 0.3,
  lineHeight: 1.6,
  color: HUD.textDim,
  opacity: 0.7,
});

type Page = "main" | "config" | "pair" | "task" | "settings";

/** 演示设备注册表：任务页与配对页共用，配对成功即标记为已配对 */
const INITIAL_DEVICES: DeviceOption[] = [
  { id: "头盔-01", alias: "1号抓鸡位", online: true, paired: true },
  { id: "头盔-02", alias: "2号抓鸡位", online: true, paired: true },
  { id: "头盔-03", alias: "3号抓鸡位", online: false, paired: false },
  { id: "头盔-04", alias: "4号抓鸡位", online: true, paired: false },
];

/** 演示模式的配对状态属于业务状态，刷新后仍需保留 */
const PAIRED_KEY = "sheyuan.paired-devices";

const loadPairedIds = (): string[] | null => {
  try {
    const raw = window.localStorage.getItem(PAIRED_KEY);
    if (raw === null) return null;
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : null;
  } catch {
    return null;
  }
};

/** 设备注册表 = 初始设备 + 设备码库里新登记的设备 */
const loadDevices = (): DeviceOption[] => {
  const pairedIds = loadPairedIds();
  const devices = INITIAL_DEVICES.map((d) => ({
    ...d,
    paired: pairedIds === null ? d.paired : pairedIds.includes(d.id),
  }));
  const extras = loadCodes()
    .filter((c) => !devices.some((d) => d.id === c.id))
    .map((c) => ({
      id: c.id,
      alias: "新登记设备",
      online: true,
      paired: pairedIds?.includes(c.id) ?? false,
    }));
  return [...devices, ...extras];
};

interface AppContentProps {
  role: Role;
  onLogout: () => void;
}

function AppContent({ role, onLogout }: AppContentProps) {
  const [page, setPage] = useState<Page>("main");
  /** 双击放大的那一路画面；放大后左右目与 手部图各占一半 */
  const [expandedEye, setExpandedEye] = useState<CameraEye | null>(null);
  /** 演示模式的本地设备注册表；真实模式以服务端设备列表为准 */
  const [devices, setDevices] = useState<DeviceOption[]>(loadDevices);
  /** 设备码库由管理员在设置页维护，配对页只认库内设备码 */
  const [codes, setCodes] = useState<DeviceCodeEntry[]>(loadCodes);
  /** 全局设备视图：配对状态 + 运行状态，顶栏与各页面共用同一份 */
  const feed = useDevicesFeed(!USE_MOCK);
  const allDevices = useMemo<DeviceOption[]>(() => {
    if (USE_MOCK) {
      return devices.map((d): DeviceOption => ({
        ...d,
        state: d.online ? "online" : "offline",
      }));
    }
    return (feed.devices ?? []).map((item) => ({
      id: item.device_id,
      alias: item.alias ?? undefined,
      online: item.runtime.state !== "offline",
      paired: item.pair_status === "paired",
      state: item.runtime.state,
    }));
  }, [devices, feed.devices]);
  /** 可预览设备：已配对、在线且非故障 */
  const connectedDevices = useMemo(
    () => allDevices.filter((d) => d.paired && d.online && d.state !== "fault"),
    [allDevices],
  );

  useEffect(() => {
    saveCodes(codes);
  }, [codes]);

  useEffect(() => {
    if (!USE_MOCK) return;
    const ids = devices.filter((d) => d.paired).map((d) => d.id);
    try {
      window.localStorage.setItem(PAIRED_KEY, JSON.stringify(ids));
    } catch {
      /* 隐私模式下写入失败时仅保留内存状态 */
    }
  }, [devices]);
  /** 顶栏选中的设备；失效或未选时回落到第一台 */
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  /** 自增信号：配对页点「新建任务」时让任务页切到新建任务 */
  const [newTaskSignal, setNewTaskSignal] = useState(0);
  const activeDeviceId =
    selectedDeviceId && connectedDevices.some((d) => d.id === selectedDeviceId)
      ? selectedDeviceId
      : (connectedDevices[0]?.id ?? null);
  /** 首页无画面时的原因提示：未接入 / 未配对 / 已配对但不可用 */
  const emptyHint =
    allDevices.length === 0
      ? "未接入设备"
      : allDevices.some((d) => d.paired)
        ? "已配对设备当前不可用"
        : "已接入设备未配对";

  /** 只读角色不允许停留在设备配对页，非管理员不允许停留在设置页 */
  useEffect(() => {
    if (role === "viewer" && page === "pair") setPage("main");
    if (role !== "admin" && page === "settings") setPage("main");
  }, [role, page]);

  const toggleEye = (eye: CameraEye) =>
    setExpandedEye((current) => (current === eye ? null : eye));

  const handleSelectDevice = (id: string) => {
    setSelectedDeviceId(id);
    setPage("main");
  };

  const handlePaired = (id: string) => {
    if (!USE_MOCK) {
      void feed.reload();
      return;
    }
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, paired: true } : d)),
    );
  };

  const handleUnpaired = (id: string) => {
    if (!USE_MOCK) {
      void feed.reload();
      return;
    }
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, paired: false } : d)),
    );
  };

  /** 管理员登记设备码：分配新设备号并加入注册表，等待现场配对 */
  const handleAddCode = (
    code: string,
  ): { ok: true; id: string } | { ok: false; message: string } => {
    if (codes.some((c) => c.code === code)) {
      return { ok: false, message: "该设备码已在库中" };
    }
    const maxNo = devices.reduce((max, d) => {
      const no = Number(d.id.split("-").pop());
      return Number.isFinite(no) ? Math.max(max, no) : max;
    }, 0);
    const id = `头盔-${String(maxNo + 1).padStart(2, "0")}`;
    setCodes((prev) => [...prev, { id, code }]);
    setDevices((prev) => [
      ...prev,
      { id, alias: "新登记设备", online: true, paired: false },
    ]);
    return { ok: true, id };
  };

  /** 移除设备码：该设备无法再通过配对校验，已建立的连接一并断开 */
  const handleRemoveCode = (id: string) => {
    setCodes((prev) => prev.filter((c) => c.id !== id));
    setDevices((prev) =>
      prev
        .filter((d) => INITIAL_DEVICES.some((base) => base.id === d.id) || d.id !== id)
        .map((d) => (d.id === id ? { ...d, paired: false } : d)),
    );
  };

  return (
    <AppContainer>
      <AppBar
        role={role}
        onLogout={onLogout}
        page={page}
        onNavigate={setPage}
        devices={allDevices}
        activeDeviceId={activeDeviceId}
        onSelectDevice={handleSelectDevice}
      />

      {page === "main" ? (
        connectedDevices.length > 0 ? (
          <MediaRow>
            <VideoColumn $grow={expandedEye ? 1 : 2}>
              <VideoPanel
                deviceId={activeDeviceId}
                expanded={expandedEye}
                onToggle={toggleEye}
              />
            </VideoColumn>
            <ViewerColumn>
              <ViewerPanel mode="手部图" />
            </ViewerColumn>
          </MediaRow>
        ) : (
          <MediaRow>
            <VideoColumn $grow={2}>
              <EmptyEyes>
                <EmptyPane>
                  <EmptyTag>左目</EmptyTag>
                  <EmptyTitle>无画面</EmptyTitle>
                  <EmptyHint>{emptyHint}</EmptyHint>
                </EmptyPane>
                <EmptyPane>
                  <EmptyTag>右目</EmptyTag>
                  <EmptyTitle>无画面</EmptyTitle>
                  <EmptyHint>{emptyHint}</EmptyHint>
                </EmptyPane>
              </EmptyEyes>
            </VideoColumn>
            <ViewerColumn>
              <EmptyPane>
                <EmptyTag>手部图</EmptyTag>
                <EmptyTitle>无画面</EmptyTitle>
                <EmptyHint>
                  {allDevices.length === 0
                    ? "未接入设备 · 请先在「设备配对」接入"
                    : "请检查设备在线状态与配对结果"}
                </EmptyHint>
              </EmptyPane>
            </ViewerColumn>
          </MediaRow>
        )
      ) : page === "config" ? (
        <DevicePage />
      ) : page === "pair" && role !== "viewer" ? (
        <PairingPage
          devices={allDevices}
          codes={codes}
          onPaired={handlePaired}
          onUnpaired={handleUnpaired}
          onCreateTask={() => {
            setNewTaskSignal((n) => n + 1);
            setPage("task");
          }}
        />
      ) : page === "settings" && role === "admin" ? (
        <SettingsPage
          codes={codes}
          devices={allDevices}
          onAddCode={handleAddCode}
          onRemoveCode={handleRemoveCode}
        />
      ) : null}
      {/* 保持在挂载状态，切页回来任务与计时不丢 */}
      <TaskInfoPage
        hidden={page !== "task"}
        role={role}
        devices={allDevices}
        newTaskSignal={newTaskSignal}
      />
    </AppContainer>
  );
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => authApi.currentUser());
  const [notice, setNotice] = useState("");

  useEffect(
    () =>
      authApi.onUnauthorized(() => {
        setUser(null);
        setNotice("登录已过期，请重新登录");
      }),
    [],
  );

  const handleLogin = (next: AuthUser) => {
    setUser(next);
    setNotice("");
  };

  const handleLogout = () => {
    void authApi.logout();
    setUser(null);
    setNotice("");
  };

  if (!user) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginPage onLogin={handleLogin} notice={notice} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotificationProvider>
        <PlaybackProvider>
          <AppContent role={user.role} onLogout={handleLogout} />
        </PlaybackProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
