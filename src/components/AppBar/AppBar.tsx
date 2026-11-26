import { Menu, MenuItem, Button } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useState } from "react";
import { HUD } from "../../theme/theme";
import type { Role } from "../../api";
import { ChevronDownIcon } from "../icons";

const AppBarContainer = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  height: 40,
  backgroundColor: theme.palette.appBar.main,
  color: theme.palette.appBar.text,
  userSelect: "none",
  borderBottom: `1px solid ${theme.palette.divider}`,
  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.32)",
}));

const ToolbarGrid = styled("div")({
  display: "grid",
  width: "100%",
  height: "100%",
  gridTemplateAreas: `"start middle end"`,
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  padding: "0 10px",
  // 窄屏不再居中悬浮，避免与左侧导航互相遮挡
  "@media (max-width: 760px)": {
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
  },
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
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: 0.2,
  "& .prefix": { color: HUD.textDim, fontWeight: 400 },
  // 窄屏只保留状态与台数，给左侧导航让位
  "@media (max-width: 900px)": {
    "& .prefix": { display: "none" },
  },
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

const MenuBarButton = styled(Button)({
  position: "relative",
  color: HUD.textDim,
  textTransform: "none",
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: 0.2,
  padding: "5px 10px",
  borderRadius: 5,
  minWidth: 0,
  whiteSpace: "nowrap",
  flexShrink: 0,
  transition: "color 160ms ease, background-color 160ms ease",
  "&.is-active": {
    color: HUD.text,
    fontWeight: 600,
  },
  "&.is-active::after": {
    content: '""',
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: HUD.cyan,
    opacity: 0.9,
  },
  "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.05)", color: HUD.text },
});

const DataSourceDisplay = styled("button")({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "3px 7px",
  margin: "0 -7px",
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: HUD.text,
  font: "inherit",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background-color 160ms ease",
  "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.05)" },
  "&:focus-visible": { outline: `1px solid ${HUD.lineStrong}` },
});

const StatusDot = styled("div")<{ status: "connected" | "disconnected" | "error" }>(({ status }) => ({
  width: 7,
  height: 7,
  borderRadius: "50%",
  backgroundColor:
    status === "connected" ? HUD.ok : status === "error" ? HUD.danger : HUD.textDim,
  boxShadow:
    status === "connected"
      ? "0 0 5px rgba(95, 208, 138, 0.55)"
      : status === "error"
        ? "0 0 5px rgba(245, 73, 102, 0.55)"
        : "none",
}));

const DeviceDot = styled("i")({
  width: 5,
  height: 5,
  borderRadius: "50%",
  backgroundColor: HUD.ok,
  boxShadow: "0 0 4px rgba(95, 208, 138, 0.5)",
  flexShrink: 0,
});

const DeviceAlias = styled("span")({
  minWidth: 0,
  marginRight: "auto",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 10.5,
  color: HUD.textDim,
});

const CurrentCheck = styled("span")({
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  color: HUD.cyan,
});

const ROLE_LABEL: Record<Role, string> = {
  viewer: "viewer（查看）",
  operator: "operator（操作）",
  admin: "admin（管理）",
};

const AccountSwitch = styled("button")({
  height: 26,
  padding: "0 12px",
  border: "1px solid rgba(63, 178, 255, 0.45)",
  borderRadius: 5,
  background: HUD.cyanDim,
  color: "#ffffff",
  font: "inherit",
  fontSize: 12,
  letterSpacing: 0.3,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  transition: "background-color 160ms ease, border-color 160ms ease",
  "&:hover": {
    backgroundColor: "#2480c2",
    borderColor: "rgba(63, 178, 255, 0.7)",
  },
});

const RoleTag = styled("span")({
  padding: "1px 7px",
  borderRadius: 5,
  border: `1px solid ${HUD.lineSoft}`,
  fontSize: 10.5,
  letterSpacing: 0.3,
  color: HUD.textDim,
  whiteSpace: "nowrap",
  flexShrink: 0,
});

type Page = "main" | "config" | "pair" | "task" | "settings";

interface AppBarDevice {
  id: string;
  alias?: string;
  online: boolean;
  paired: boolean;
}

interface AppBarProps {
  role: Role;
  onLogout: () => void;
  page: Page;
  onNavigate: (page: Page) => void;
  /** 在线且已配对的设备 */
  devices: AppBarDevice[];
  activeDeviceId: string | null;
  onSelectDevice: (id: string) => void;
}

export default function AppBar({
  role,
  onLogout,
  page,
  onNavigate,
  devices,
  activeDeviceId,
  onSelectDevice,
}: AppBarProps) {
  const [deviceMenuEl, setDeviceMenuEl] = useState<null | HTMLElement>(null);

  return (
    <AppBarContainer>
      <ToolbarGrid>
        <StartSection>
          <MenuBarButton
            className={page === "main" ? "is-active" : undefined}
            onClick={() => onNavigate("main")}
          >
            首页
          </MenuBarButton>
          <MenuBarButton
            className={page === "config" ? "is-active" : undefined}
            onClick={() => onNavigate("config")}
          >
            设备信息
          </MenuBarButton>
          {(role === "operator" || role === "admin") && (
            <MenuBarButton
              className={page === "pair" ? "is-active" : undefined}
              onClick={() => onNavigate("pair")}
            >
              设备配对
            </MenuBarButton>
          )}
          <MenuBarButton
            className={page === "task" ? "is-active" : undefined}
            onClick={() => onNavigate("task")}
          >
            任务信息
          </MenuBarButton>
          {role === "admin" && (
            <MenuBarButton
              className={page === "settings" ? "is-active" : undefined}
              onClick={() => onNavigate("settings")}
            >
              设置
            </MenuBarButton>
          )}
        </StartSection>

        <MiddleSection>
          <DataSourceDisplay
            type="button"
            aria-haspopup="menu"
            aria-expanded={Boolean(deviceMenuEl)}
            aria-label={`双目采集 ${devices.length > 0 ? "已连接" : "未连接"}，共 ${devices.length} 台设备`}
            onClick={(e) => setDeviceMenuEl(e.currentTarget)}
          >
            <StatusDot status={devices.length > 0 ? "connected" : "disconnected"} />
            <span>
              <span className="prefix">双目采集 · </span>
              {devices.length > 0 ? "已连接" : "未连接"}（{devices.length}）
            </span>
            <ChevronDownIcon style={{ fontSize: 11, opacity: 0.55 }} />
          </DataSourceDisplay>
          <Menu
            anchorEl={deviceMenuEl}
            open={Boolean(deviceMenuEl)}
            onClose={() => setDeviceMenuEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            transformOrigin={{ vertical: "top", horizontal: "center" }}
            slotProps={{
              paper: {
                sx: {
                  mt: "6px",
                  width: 216,
                  p: "4px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(6, 13, 27, 0.97)",
                  border: `1px solid ${HUD.line}`,
                  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
                  backdropFilter: "blur(8px)",
                },
              },
            }}
          >
            {devices.length === 0 ? (
              <MenuItem
                disabled
                sx={{
                  minWidth: 200,
                  minHeight: 34,
                  borderRadius: "4px",
                  fontSize: 12,
                  opacity: 1,
                  color: HUD.textDim,
                }}
              >
                暂无已连接设备
              </MenuItem>
            ) : (
              devices.map((device) => {
                const active = device.id === activeDeviceId;
                return (
                  <MenuItem
                    key={device.id}
                    selected={active}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      onSelectDevice(device.id);
                      setDeviceMenuEl(null);
                    }}
                    sx={{
                      minWidth: 200,
                      minHeight: 34,
                      gap: "8px",
                      px: "8px",
                      borderRadius: "4px",
                      fontSize: 12.5,
                      color: HUD.text,
                      "&.Mui-selected": {
                        backgroundColor: "rgba(63, 178, 255, 0.10)",
                        boxShadow: `inset 2px 0 0 ${HUD.cyan}`,
                        "&:hover": { backgroundColor: "rgba(63, 178, 255, 0.14)" },
                      },
                    }}
                  >
                    <DeviceDot />
                    <span style={{ flexShrink: 0 }}>{device.id}</span>
                    {device.alias ? <DeviceAlias>{device.alias}</DeviceAlias> : null}
                    {active ? (
                      <CurrentCheck>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path
                            d="M2.5 6.2 4.8 8.5 9.5 3.8"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </CurrentCheck>
                    ) : null}
                  </MenuItem>
                );
              })
            )}
          </Menu>
        </MiddleSection>

        <EndSection>
          <AccountSwitch type="button" onClick={onLogout}>
            切换账号
          </AccountSwitch>
          <RoleTag>{ROLE_LABEL[role]}</RoleTag>
        </EndSection>
      </ToolbarGrid>
    </AppBarContainer>
  );
}
