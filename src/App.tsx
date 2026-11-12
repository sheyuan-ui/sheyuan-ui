import { useState } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { styled } from "@mui/material/styles";
import theme from "./theme/theme";
import AppBar from "./components/AppBar/AppBar";
import VideoPanel from "./components/VideoPanel/VideoPanel";
import HandPosePanel from "./components/HandPosePanel/HandPosePanel";
import type { ViewMode } from "./components/Hud/viewModes";
import AnnotationBar from "./components/AnnotationBar/AnnotationBar";
import CheckLine from "./components/Hud/CheckLine";
import ViewerPanel from "./components/Viewer/ViewerPanel";
import ViewerControls from "./components/Viewer/ViewerControls";
import {
  DEFAULT_ATTRS,
  DEFAULT_BASE_3D,
  DEFAULT_BASE_ADJUST,
  type Base3D,
  type BaseAdjust,
  type ViewAttrs,
} from "./components/Hud/viewModes";
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
 * 右侧边栏：上方是显示切换与画面属性，底部保留动作标注勾选。
 * 宽度按屏宽比例给控件留出余量；顶栏的边栏图标控制收放，收起时整块宽度归零。
 */
const ReservedArea = styled("div")<{ $shown: boolean }>(({ theme, $shown }) => ({
  width: $shown ? "calc(12.5% - 32px)" : 0,
  minWidth: $shown ? 160 : 0,
  maxWidth: $shown ? 200 : 0,
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  overflow: "hidden",
  backgroundColor: "#04090f",
  transition:
    "width 260ms cubic-bezier(0.25, 0.8, 0.3, 1), min-width 260ms cubic-bezier(0.25, 0.8, 0.3, 1), max-width 260ms cubic-bezier(0.25, 0.8, 0.3, 1)",
  // 覆盖 MainArea 给的分隔线：收起后不留竖线
  "&&": { borderLeft: $shown ? `1px solid ${theme.palette.divider}` : "none" },
}));

/** 右栏底部：动作标注勾选贴底，与上方属性区用一条线分开 */
const RailFooter = styled("div")(({ theme }) => ({
  flexShrink: 0,
  marginTop: "auto",
  borderTop: `1px solid ${theme.palette.divider}`,
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
  /** 菜单栏选中的视图：分割图 = 原来的三个图，其余视图共用右侧展示区 */
  const [viewMode, setViewMode] = useState<ViewMode>("分割图");
  /** 每个视图各自的配色与底色，切换视图时保留 */
  const [viewAttrs, setViewAttrs] = useState<Record<ViewMode, ViewAttrs>>(DEFAULT_ATTRS);
  /** 3D 图下面垫哪张采集图，以及这张底图自己的色带 */
  const [base3d, setBase3d] = useState<Base3D>(DEFAULT_BASE_3D);
  const [base3dPalette, setBase3dPalette] = useState("raw");
  /** 底图的不透明度 / 亮度 / 对比度，让 3D 场景压在图上时层次可控 */
  const [baseAdjust, setBaseAdjust] = useState<BaseAdjust>(DEFAULT_BASE_ADJUST);
  const baseAttrs: ViewAttrs = { palette: base3dPalette, bg: viewAttrs["3D图"].bg };

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
            {viewMode === "分割图" ? (
              <HandPosePanel />
            ) : (
              <ViewerPanel
                mode={viewMode}
                attrs={viewAttrs[viewMode]}
                base={base3d}
                baseAttrs={baseAttrs}
                baseAdjust={baseAdjust}
              />
            )}
            <ReservedArea $shown={rightPanelOpen}>
              {viewMode !== "分割图" && (
                <ViewerControls
                  mode={viewMode}
                  onMode={setViewMode}
                  attrs={viewAttrs[viewMode]}
                  onChange={(patch) =>
                    setViewAttrs((prev) => ({
                      ...prev,
                      [viewMode]: { ...prev[viewMode], ...patch },
                    }))
                  }
                  base={base3d}
                  baseAttrs={baseAttrs}
                  baseAdjust={baseAdjust}
                  onBase={setBase3d}
                  onBasePalette={setBase3dPalette}
                  onBaseAdjust={(patch) => setBaseAdjust((prev) => ({ ...prev, ...patch }))}
                />
              )}
              <RailFooter>
                <CheckLine
                  label="动作标注"
                  checked={annotationShown}
                  onChange={setAnnotationShown}
                />
              </RailFooter>
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
