import { createTheme } from "@mui/material/styles";

/**
 * 深色 HUD 配色令牌：组件里直接用 HUD.xxx，
 * theme.palette 也映射到同一套值，保证两边一致。
 */
export const HUD = {
  deep: "#03070f",
  panel: "#060d1b",
  panelSoft: "#0a1526",
  line: "rgba(72, 148, 235, 0.22)",
  lineSoft: "rgba(126, 162, 205, 0.10)",
  lineStrong: "rgba(96, 176, 255, 0.55)",
  cyan: "#3fb2ff",
  cyanDim: "#1c6ea8",
  gold: "#f2a33c",
  orange: "#ef833a",
  text: "#d7e7fb",
  textDim: "#7e97b8",
  danger: "#f54966",
  ok: "#5fd08a",
} as const;

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: HUD.cyan },
    secondary: { main: HUD.gold },
    error: { main: HUD.danger },
    warning: { main: "#f0ad4e" },
    success: { main: HUD.ok },
    info: { main: HUD.cyanDim },
    text: {
      primary: HUD.text,
      secondary: HUD.textDim,
    },
    // 结构线（模块分隔、栏底边）走中性冷灰，别和交互高亮的蓝抢戏
    divider: "rgba(126, 162, 205, 0.14)",
    background: {
      default: HUD.deep,
      paper: HUD.panel,
    },
    appBar: {
      main: "#050b16",
      text: HUD.text,
    },
  },
  typography: {
    fontSize: 14,
    fontFamily:
      '"Inter", "HarmonyOS Sans SC", "MiSans", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 400, letterSpacing: "-2.16px" },
    h2: { fontWeight: 400, letterSpacing: "-0.72px" },
    h3: { fontWeight: 400, letterSpacing: "-0.325px" },
    h4: { fontWeight: 400, letterSpacing: "-0.11px" },
    h5: { fontWeight: 600, letterSpacing: "0" },
    h6: { fontWeight: 600, letterSpacing: "0" },
    subtitle1: { fontWeight: 400, letterSpacing: "0" },
    subtitle2: { fontWeight: 400, letterSpacing: "0" },
    body1: { fontWeight: 400, letterSpacing: "0" },
    body2: { fontWeight: 400, letterSpacing: "0" },
    button: { fontWeight: 500, letterSpacing: "0" },
    caption: { fontWeight: 400, letterSpacing: "0" },
    overline: { fontWeight: 600, letterSpacing: "0.88px", textTransform: "uppercase" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: HUD.deep,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(126, 162, 205, 0.22) transparent",
        },
        "*::-webkit-scrollbar": { width: 9, height: 9 },
        "*::-webkit-scrollbar-track": { background: "transparent" },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: "rgba(126, 162, 205, 0.16)",
          borderRadius: 8,
          border: "3px solid transparent",
          backgroundClip: "content-box",
        },
        "*::-webkit-scrollbar-thumb:hover": {
          backgroundColor: "rgba(126, 162, 205, 0.30)",
          backgroundClip: "content-box",
        },
        "*::-webkit-scrollbar-corner": { background: "transparent" },
        // 键盘操作时给一圈细描边；鼠标点不显示，不影响观感
        "*:focus-visible": {
          outline: `1px solid ${HUD.lineStrong}`,
          outlineOffset: -1,
          borderRadius: 2,
        },
        "::selection": {
          backgroundColor: "rgba(63, 178, 255, 0.22)",
          color: HUD.text,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 4,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: HUD.panelSoft,
          border: `1px solid ${HUD.line}`,
          borderRadius: 5,
          padding: "5px 9px",
          fontSize: 11.5,
          letterSpacing: 0.2,
          color: HUD.text,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: HUD.panelSoft,
          border: `1px solid ${HUD.lineSoft}`,
          borderRadius: 8,
          padding: "4px 0",
          boxShadow: "0 18px 44px rgba(0, 0, 0, 0.62)",
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          transition: "background-color 140ms ease, color 140ms ease",
          "&:hover": { backgroundColor: "rgba(63, 178, 255, 0.10)" },
        },
      },
    },
  },
});

declare module "@mui/material/styles" {
  interface Palette {
    appBar: {
      main: string;
      text: string;
    };
  }
  interface PaletteOptions {
    appBar?: {
      main: string;
      text: string;
    };
  }
}

export default theme;
