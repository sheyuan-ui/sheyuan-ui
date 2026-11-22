import { useState } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { styled } from "@mui/material/styles";
import theme from "./theme/theme";
import AppBar from "./components/AppBar/AppBar";
import VideoPanel, { type CameraEye } from "./components/VideoPanel/VideoPanel";
import ViewerPanel from "./components/Viewer/ViewerPanel";
import DevicePage from "./components/DeviceStatus/DevicePage";
import TaskInfoPage from "./components/TaskInfo/TaskInfoPage";
import type { DeviceOption } from "./components/TaskInfo/NewTaskForm";
import LoginPage from "./components/Login/LoginPage";
import { NotificationProvider, useNotification } from "./contexts/NotificationContext";
import { PlaybackProvider } from "./contexts/PlaybackContext";

const AppContainer = styled("div")({
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  width: "100vw",
  overflow: "hidden",
});

/** 图片视图：左目 / 右目 / 效果图三栏等宽；双击放大时收成两栏等宽 */
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

/** 无设备连接时的空白画面 */
const EmptyMain = styled("div")({
  flex: 1,
  minHeight: 0,
});

type Page = "main" | "config" | "task";

interface AppContentProps {
  loggedInUser: string;
  onLogout: () => void;
}

function AppContent({ loggedInUser, onLogout }: AppContentProps) {
  const { notify } = useNotification();
  const [page, setPage] = useState<Page>("main");
  /** 双击放大的那一路画面；放大后左右目与效果图各占一半 */
  const [expandedEye, setExpandedEye] = useState<CameraEye | null>(null);
  /** 在线且已配对的设备，由任务页统一维护 */
  const [connectedDevices, setConnectedDevices] = useState<DeviceOption[]>([]);
  /** 顶栏选中的设备；失效或未选时回落到第一台 */
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const activeDeviceId =
    selectedDeviceId && connectedDevices.some((d) => d.id === selectedDeviceId)
      ? selectedDeviceId
      : (connectedDevices[0]?.id ?? null);

  const toggleEye = (eye: CameraEye) =>
    setExpandedEye((current) => (current === eye ? null : eye));

  const handleSelectDevice = (id: string) => {
    setSelectedDeviceId(id);
    setPage("main");
  };

  return (
    <AppContainer>
      <AppBar
        loggedInUser={loggedInUser}
        onLogout={onLogout}
        onMenuAction={(action) => notify(`${action}`, "info")}
        page={page}
        onNavigate={setPage}
        devices={connectedDevices}
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
              <ViewerPanel mode="效果图" />
            </ViewerColumn>
          </MediaRow>
        ) : (
          <EmptyMain />
        )
      ) : page === "config" ? (
        <DevicePage />
      ) : null}
      {/* 保持在挂载状态，切页回来任务与计时不丢 */}
      <TaskInfoPage hidden={page !== "task"} onConnectedDevicesChange={setConnectedDevices} />
    </AppContainer>
  );
}

function App() {
  const [loggedInUser, setLoggedInUser] = useState<string | null>(() => {
    return localStorage.getItem("lichtblick_user");
  });

  const handleLogin = (username: string) => {
    localStorage.setItem("lichtblick_user", username);
    setLoggedInUser(username);
  };

  const handleLogout = () => {
    localStorage.removeItem("lichtblick_user");
    setLoggedInUser(null);
  };

  if (!loggedInUser) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginPage onLogin={handleLogin} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotificationProvider>
        <PlaybackProvider>
          <AppContent loggedInUser={loggedInUser} onLogout={handleLogout} />
        </PlaybackProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
