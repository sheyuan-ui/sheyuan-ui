import { useState } from "react";
import type { FormEvent } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { VisibilityIcon, VisibilityOffIcon } from "../icons";
import { authApi, type AuthUser } from "../../api";

const BLUE = "#4a9ee6";
const GRAY = "#9a9a9a";
const LINE = "#d9d9d9";

const Page = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  width: "100vw",
  backgroundColor: "#ffffff",
});

const Card = styled(Box)({
  width: "min(440px, 82vw)",
  display: "flex",
  flexDirection: "column",
});

const Brand = styled(Typography)({
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: 3,
  color: "#393939",
  textAlign: "center",
  marginBottom: 56,
});

const FieldRow = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderBottom: `1px solid ${LINE}`,
  paddingBottom: 12,
  "&:focus-within": {
    borderBottomColor: BLUE,
  },
});

const FieldIcon = styled(Box)({
  display: "flex",
  alignItems: "center",
  color: GRAY,
  flexShrink: 0,
});

const NativeInput = styled("input")({
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: 16,
  color: "#393939",
  padding: "4px 0",
  "&::placeholder": {
    color: GRAY,
  },
});

const GhostIconButton = styled(IconButton)({
  color: GRAY,
  padding: 4,
});

const PillButton = styled(Button)({
  height: 52,
  borderRadius: 26,
  border: `1.5px solid ${BLUE}`,
  backgroundColor: "transparent",
  color: BLUE,
  fontSize: 17,
  fontWeight: 500,
  textTransform: "none",
  letterSpacing: 6,
  "&:hover": {
    border: `1.5px solid ${BLUE}`,
    backgroundColor: "rgba(74, 158, 230, 0.08)",
  },
  "&.Mui-disabled": {
    borderColor: LINE,
    color: GRAY,
  },
});

const ErrorText = styled(Typography)({
  fontSize: 13,
  color: "#f54966",
  minHeight: 18,
});

function UserIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.2c-3.3 0-6.6 1.7-6.6 4.1v2.2c0 .6.5 1.1 1.1 1.1h11c.6 0 1.1-.5 1.1-1.1v-2.2c0-2.4-3.3-4.1-6.6-4.1z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 9.5V7.8c0-3-2.5-5.6-5.5-5.6S6.5 4.8 6.5 7.8v1.7c-1.4 0-2.5 1.1-2.5 2.5v7c0 1.4 1.1 2.5 2.5 2.5h11c1.4 0 2.5-1.1 2.5-2.5v-7c0-1.4-1.1-2.5-2.5-2.5zM9 7.8c0-1.7 1.4-3.1 3-3.1s3 1.4 3 3.1v1.7H9V7.8zm3 9.9c-1 0-1.8-.8-1.8-1.8s.8-1.8 1.8-1.8 1.8.8 1.8 1.8-.8 1.8-1.8 1.8z" />
    </svg>
  );
}

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
  /** 会话过期等提示，展示在错误行下方 */
  notice?: string;
}

export default function LoginPage({ onLogin, notice }: LoginPageProps) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!account.trim()) {
      setError("请输入账号");
      return;
    }
    if (!password.trim()) {
      setError("请输入密码");
      return;
    }
    setLoading(true);
    try {
      const user = await authApi.login(account.trim(), password);
      onLogin(user);
    } catch {
      setError("账号或密码不正确");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <Card>
        <Brand>SHEYUAN TECH</Brand>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldRow>
            <FieldIcon>
              <UserIcon />
            </FieldIcon>
            <NativeInput
              placeholder="请输入账号"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </FieldRow>

          <FieldRow>
            <FieldIcon>
              <LockIcon />
            </FieldIcon>
            <NativeInput
              placeholder="请输入密码"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <GhostIconButton
              size="small"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </GhostIconButton>
          </FieldRow>

          <PillButton type="submit" fullWidth disabled={loading} sx={{ mt: 4 }}>
            {loading ? "登录中" : "登 录"}
          </PillButton>
        </Box>

        <Box sx={{ minHeight: 18, mt: 2 }}>
          {error ? (
            <ErrorText sx={{ mt: 0 }}>{error}</ErrorText>
          ) : notice ? (
            <Typography sx={{ fontSize: 13, color: "#6b6b6b" }}>{notice}</Typography>
          ) : null}
        </Box>

        <Typography sx={{ fontSize: 12, color: GRAY, textAlign: "center", mt: 1.5 }}>
          账号由管理员开设，系统不开放注册
        </Typography>
      </Card>
    </Page>
  );
}