import { useState } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { styled } from "@mui/material/styles";
import theme from "./theme/theme";
import AppBar from "./components/AppBar/AppBar";
import VideoPanel from "./components/VideoPanel/VideoPanel";
import HandPosePanel from "./components/HandPosePanel/HandPosePanel";
import DataViewPanel from "./components/DataViewPanel/DataViewPanel";
import type { ViewMode } from "./components/Hud/viewModes";
import AnnotationBar from "./components/AnnotationBar/AnnotationBar";
import CheckLine from "./components/Hud/CheckLine";
import DevicePage from "./components/DeviceStatus/DevicePage";
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

const MainArea = styled("div")(({ theme }) => ({
  display: "flex",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  // 模块之间不留缝，只用单条分割线
  "& > * + *": { borderLeft: `1px solid ${theme.palette.divider}` },
}));

/** 底部动作标注条：收起时高度归零，主视图自动吃掉腾出来的空间 */
const BottomBar = styled("div")<{ $shown: boolean }>(({ $shown }) => ({
  width: "100%",
  height: $shown ? 179 : 0,
  flexShrink: 0,
  overflow: "hidden",
  // 内容保持原始高度，靠父级裁切做收放，不让文字跟着压扁
  "&& > *": { height: 179 },
  transition: "height 260ms cubic-bezier(0.25, 0.8, 0.3, 1)",
}));

/**
 * 右侧预留区：放勾选行，宽度 = 参考截图那条竖向空白带的比例（约屏宽 9.5%）
 * 再收窄两个 14px 字（32px）；下限 106px 是"方格 + 动作标注"一行的实际占位。
 * 顶栏的右侧边栏图标控制它收放，收起时整块宽度归零。
 */
const ReservedArea = styled("div")<{ $shown: boolean }>(({ theme, $shown }) => ({
  width: $shown ? "calc(9.5% - 32px)" : 0,
  minWidth: $shown ? 106 : 0,
  maxWidth: $shown ? 158 : 0,
  flexShrink: 0,
  overflow: "hidden",
  backgroundColor: "#04090f",
  transition:
    "width 260ms cubic-bezier(0.25, 0.8, 0.3, 1), min-width 260ms cubic-bezier(0.25, 0.8, 0.3, 1), max-width 260ms cubic-bezier(0.25, 0.8, 0.3, 1)",
  // 覆盖 MainArea 给的分隔线：收起后不留竖线
  "&&": { borderLeft: $shown ? `1px solid ${theme.palette.divider}` : "none" },
}));

interface AppContentProps {
  loggedInUser: string;
  onLogout: () => void;
}

function AppContent({ loggedInUser, onLogout }: AppContentProps) {
  const { notify } = useNotification();
  const [page, setPage] = useState<"main" | "config">("main");
  const [annotationShown, setAnnotationShown] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  /** 菜单栏选中的视图：分割图 = 原来的三个图，点云图/深度图 = 同一块区域换画面 */
  const [viewMode, setViewMode] = useState<ViewMode>("分割图");

  return (
    <AppContainer>
      <AppBar
        loggedInUser={loggedInUser}
        onLogout={onLogout}
        onOpenDataSource={() => notify("打开数据源对话框", "info")}
        onMenuAction={(action) => notify(`${action}`, "info")}
        page={page}
        onNavigate={setPage}
        viewMode={viewMode}
        onViewMode={setViewMode}
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
      />

      {page === "main" ? (
        <>
          <MainArea>
            <VideoPanel />
            {viewMode === "分割图" ? <HandPosePanel /> : <DataViewPanel mode={viewMode} />}
            <ReservedArea $shown={rightPanelOpen}>
              <CheckLine
                label="动作标注"
                checked={annotationShown}
                onChange={setAnnotationShown}
              />
            </ReservedArea>
          </MainArea>

          <BottomBar $shown={annotationShown}>
            <AnnotationBar />
          </BottomBar>
        </>
      ) : (
        <DevicePage />
      )}
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
