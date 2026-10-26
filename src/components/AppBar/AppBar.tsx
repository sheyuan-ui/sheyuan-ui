import { Avatar, IconButton, Menu, MenuItem, Tooltip, Divider, Button } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useState } from "react";
import { HUD } from "../../theme/theme";
import { usePlayback } from "../../contexts/PlaybackContext";
import { generateTwoHands, type Pt } from "../../utils/handKeypoints";
import { VIEW_MODES, type ViewMode } from "../Hud/viewModes";
import { ChevronDownIcon, SettingsIcon } from "../icons";

const AppBarContainer = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  height: 40,
  backgroundColor: theme.palette.appBar.main,
  color: theme.palette.appBar.text,
  userSelect: "none",
  borderBottom: `1px solid ${theme.palette.divider}`,
  // 顶亮线 + 下投影：让顶栏像一块薄板，而不是一条纯色
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.035), 0 1px 12px rgba(0, 0, 0, 0.6)",
}));

const ToolbarGrid = styled("div")({
  display: "grid",
  width: "100%",
  height: "100%",
  gridTemplateAreas: `"start middle end"`,
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  padding: "0 8px",
});

const StartSection = styled("div")({
  gridArea: "start",
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  overflow: "hidden",
});

const MiddleSection = styled("div")({
  gridArea: "middle",
  justifySelf: "center",
  overflow: "hidden",
  fontSize: 13,
  fontWeight: 500,
});

const EndSection = styled("div")({
  gridArea: "end",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  overflow: "hidden",
});

const LogoButton = styled(IconButton)({
  padding: "4px 8px",
  borderRadius: 0,
  color: HUD.text,
  transition: "background-color 140ms ease",
  "&:hover": { backgroundColor: "rgba(63, 178, 255, 0.10)" },
});

const MenuBarButton = styled(Button)({
  color: HUD.textDim,
  textTransform: "none",
  fontSize: 13,
  fontWeight: 500,
  padding: "4px 10px",
  borderRadius: 0,
  minWidth: 0,
  whiteSpace: "nowrap",
  flexShrink: 0,
  transition: "color 140ms ease, background-color 140ms ease",
  "&.is-active": {
    color: HUD.cyan,
    fontWeight: 600,
    textShadow: "0 0 8px rgba(63, 178, 255, 0.32)",
  },
  "&:hover": { backgroundColor: "rgba(63, 178, 255, 0.10)", color: HUD.text },
});

const DataSourceDisplay = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  color: HUD.text,
  whiteSpace: "nowrap",
});

const StatusDot = styled("div")<{ status: "connected" | "disconnected" | "error" }>(({ status }) => ({
  width: 8,
  height: 8,
  borderRadius: "50%",
  backgroundColor:
    status === "connected" ? HUD.ok : status === "error" ? HUD.danger : HUD.cyan,
  boxShadow: `0 0 6px ${status === "connected" ? HUD.ok : status === "error" ? HUD.danger : HUD.cyan}`,
}));

/** 顶栏右侧的手部轨迹读数块；窗口变窄时逐级省略，避免整块被裁掉 */
const TrajBlock = styled("div")<{ $color: string }>(({ $color }) => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 8px",
  border: `1px solid ${HUD.line}`,
  borderRadius: 4,
  backgroundColor: "rgba(6, 13, 27, 0.6)",
  whiteSpace: "nowrap",
  flexShrink: 0,
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  "& > .hand": { color: $color, fontWeight: 600, letterSpacing: 1 },
  "& > .val": {
    fontFamily: '"Roboto Mono", "Consolas", monospace',
    color: HUD.text,
  },
  "& > .vel": {
    fontFamily: '"Roboto Mono", "Consolas", monospace',
    color: HUD.textDim,
  },
  "@media (max-width: 1240px)": {
    gap: 5,
    padding: "2px 6px",
    "& > .vel": { display: "none" },
  },
  "@media (max-width: 980px)": {
    "& > .val": { display: "none" },
  },
}));

const TrajDot = styled("span")<{ $color: string }>(({ $color }) => ({
  width: 6,
  height: 6,
  borderRadius: "50%",
  backgroundColor: $color,
  boxShadow: `0 0 6px ${$color}`,
}));

/** 右侧边栏开关：面板区高亮表示当前是展开态 */
const SideButton = styled(IconButton, { shouldForwardProp: (prop) => prop !== "$on" })<{
  $on: boolean;
}>(({ $on }) => ({
  padding: 5,
  borderRadius: 0,
  color: $on ? HUD.cyan : HUD.textDim,
  transition: "color 140ms ease, background-color 140ms ease",
  "&:hover": { backgroundColor: "rgba(63, 178, 255, 0.10)", color: HUD.cyan },
}));

function SidebarIcon({ on }: { on: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect
        x="1.75"
        y="2.75"
        width="16.5"
        height="14.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M12.5 2.75V17.25" stroke="currentColor" strokeWidth="1.5" />
      <rect
        x="12.5"
        y="2.75"
        width="5.75"
        height="14.5"
        fill="currentColor"
        opacity={on ? 0.85 : 0}
        style={{ transition: "opacity 140ms ease" }}
      />
    </svg>
  );
}

// 归一化坐标 -> 米（手掌长约 0.18m，对应 size 0.24）
const M = 0.75;

function trajOf(wrist: Pt, prev: Pt) {
  const dx = (wrist.x - prev.x) / 0.12;
  const dy = (wrist.y - prev.y) / 0.12;
  return Math.sqrt(dx * dx + dy * dy) * M;
}

interface AppBarProps {
  loggedInUser: string;
  onLogout: () => void;
  onOpenDataSource: () => void;
  onMenuAction: (action: string) => void;
  page: "main" | "config";
  onNavigate: (page: "main" | "config") => void;
  /** 菜单栏当前视图 + 切换回调，状态在 App 里，右栏那块区域跟着换 */
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
}

export default function AppBar({
  loggedInUser,
  onLogout,
  onOpenDataSource,
  onMenuAction,
  page,
  onNavigate,
  viewMode,
  onViewMode,
  rightPanelOpen,
  onToggleRightPanel,
}: AppBarProps) {
  const [appMenuEl, setAppMenuEl] = useState<null | HTMLElement>(null);
  const [userMenuEl, setUserMenuEl] = useState<null | HTMLElement>(null);
  const [viewMenuEl, setViewMenuEl] = useState<null | HTMLElement>(null);
  const { currentTime } = usePlayback();

  const { left, right } = generateTwoHands(currentTime);
  const prev = generateTwoHands(Math.max(currentTime - 0.12, 0));
  const vLeft = trajOf(left[0], prev.left[0]);
  const vRight = trajOf(right[0], prev.right[0]);

  return (
    <AppBarContainer>
      <ToolbarGrid>
        <StartSection>
          <LogoButton onClick={(e) => setAppMenuEl(e.currentTarget)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z"
                fill={HUD.cyan}
              />
            </svg>
            <ChevronDownIcon style={{ fontSize: 12, marginLeft: 4 }} />
          </LogoButton>
          <Menu
            anchorEl={appMenuEl}
            open={Boolean(appMenuEl)}
            onClose={() => setAppMenuEl(null)}
          >
            <MenuItem onClick={() => { onMenuAction("打开文件…"); setAppMenuEl(null); }}>打开文件</MenuItem>
            <MenuItem onClick={() => { onMenuAction("打开连接…"); setAppMenuEl(null); }}>打开连接</MenuItem>
            <Divider />
            <MenuItem onClick={() => { onMenuAction("设置"); setAppMenuEl(null); }}>设置</MenuItem>
            <MenuItem onClick={() => { onMenuAction("帮助与文档"); setAppMenuEl(null); }}>帮助</MenuItem>
          </Menu>

          <MenuBarButton
            className={page === "main" ? "is-active" : undefined}
            onClick={() => onNavigate("main")}
          >
            首页
          </MenuBarButton>
          <MenuBarButton
            className={viewMenuEl || viewMode !== "分割图" ? "is-active" : undefined}
            onClick={(e) => setViewMenuEl(e.currentTarget)}
            sx={{ gap: 0.5 }}
          >
            菜单栏
            <ChevronDownIcon
              style={{
                fontSize: 12,
                transition: "transform 160ms ease",
                transform: viewMenuEl ? "rotate(180deg)" : "none",
              }}
            />
          </MenuBarButton>
          <Menu
            anchorEl={viewMenuEl}
            open={Boolean(viewMenuEl)}
            onClose={() => setViewMenuEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          >
            {VIEW_MODES.map((mode) => (
              <MenuItem
                key={mode}
                selected={viewMode === mode}
                sx={{
                  fontSize: 13,
                  minHeight: 34,
                  letterSpacing: 1,
                  color: viewMode === mode ? HUD.cyan : HUD.text,
                  fontWeight: viewMode === mode ? 600 : 400,
                }}
                onClick={() => {
                  onViewMode(mode);
                  setViewMenuEl(null);
                }}
              >
                {mode}
              </MenuItem>
            ))}
          </Menu>
          <MenuBarButton
            className={page === "config" ? "is-active" : undefined}
            onClick={() => onNavigate("config")}
          >
            设备信息
          </MenuBarButton>
        </StartSection>

        <MiddleSection>
          <DataSourceDisplay onClick={onOpenDataSource}>
            <StatusDot status="connected" />
            <span>双目采集 · 已连接</span>
            <ChevronDownIcon style={{ fontSize: 12 }} />
          </DataSourceDisplay>
        </MiddleSection>

        <EndSection>
          {page === "main" && (
            <>
              <TrajBlock $color="#3fd0c9">
                <TrajDot $color="#3fd0c9" />
                <span className="hand">左手</span>
                <span className="val">
                  {(left[0].x * M).toFixed(2)}, {(left[0].y * M).toFixed(2)}
                </span>
                <span className="vel">{vLeft.toFixed(2)}m/s</span>
              </TrajBlock>
              <TrajBlock $color={HUD.gold}>
                <TrajDot $color={HUD.gold} />
                <span className="hand">右手</span>
                <span className="val">
                  {(right[0].x * M).toFixed(2)}, {(right[0].y * M).toFixed(2)}
                </span>
                <span className="vel">{vRight.toFixed(2)}m/s</span>
              </TrajBlock>
            </>
          )}

          <Tooltip title={rightPanelOpen ? "收起右侧边栏" : "展开右侧边栏"}>
            <SideButton
              $on={rightPanelOpen}
              aria-label="右侧边栏"
              aria-pressed={rightPanelOpen}
              onClick={onToggleRightPanel}
            >
              <SidebarIcon on={rightPanelOpen} />
            </SideButton>
          </Tooltip>

          <Tooltip title="个人资料">
            <IconButton
              onClick={(e) => setUserMenuEl(e.currentTarget)}
              sx={{
                padding: "4px",
                borderRadius: 0,
                transition: "background-color 140ms ease",
                "&:hover": { backgroundColor: "rgba(63, 178, 255, 0.10)" },
              }}
            >
              <Avatar
                variant="rounded"
                sx={{
                  height: 24,
                  width: 24,
                  bgcolor: HUD.cyanDim,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#fff",
                }}
              >
                {loggedInUser.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={userMenuEl}
            open={Boolean(userMenuEl)}
            onClose={() => setUserMenuEl(null)}
          >
            <MenuItem disabled sx={{ fontSize: 12, color: HUD.textDim, minHeight: 32 }}>
              {loggedInUser}
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { onMenuAction("设置"); setUserMenuEl(null); }}>
              <SettingsIcon style={{ marginRight: 8, fontSize: 16 }} />
              设置
            </MenuItem>
            <MenuItem onClick={() => { onMenuAction("关于 SHEYUAN TECH"); setUserMenuEl(null); }}>关于</MenuItem>
            <Divider />
            <MenuItem
              onClick={() => { onLogout(); setUserMenuEl(null); }}
              sx={{ color: HUD.danger }}
            >
              退出登录
            </MenuItem>
          </Menu>
        </EndSection>
      </ToolbarGrid>
    </AppBarContainer>
  );
}
