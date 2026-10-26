import { useEffect, useRef, useState } from "react";
import { Box, Button, Dialog, DialogContent, IconButton, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { CloseIcon, VisibilityIcon, VisibilityOffIcon } from "../icons";

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

const FormColumn = styled(Box)({
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

const SolidPillButton = styled(Button)({
  height: 40,
  borderRadius: 20,
  backgroundColor: BLUE,
  color: "#ffffff",
  fontSize: 14,
  textTransform: "none",
  padding: "0 20px",
  flexShrink: 0,
  "&:hover": {
    backgroundColor: "#3d8dd4",
  },
  "&.Mui-disabled": {
    backgroundColor: "#cfe3f5",
    color: "#ffffff",
  },
});

const LinkText = styled(Typography)({
  fontSize: 15,
  color: "#6b6b6b",
  cursor: "pointer",
  "&:hover": {
    color: BLUE,
  },
});

const ErrorText = styled(Typography)({
  fontSize: 13,
  color: "#f54966",
  minHeight: 18,
  marginTop: 16,
});

const ModalPage = styled(Box)({
  position: "relative",
  height: "100vh",
  width: "100vw",
  backgroundColor: "#ffffff",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
});

const ModalTitle = styled(Typography)({
  fontSize: 34,
  fontWeight: 700,
  color: "#393939",
  marginBottom: 72,
});

const CloseButton = styled(IconButton)({
  position: "absolute",
  top: 24,
  right: 32,
  color: "#393939",
});

const ModalBody = styled(Box)({
  width: "min(760px, 84vw)",
  margin: "0 auto",
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
  onLogin: (username: string) => void;
}

type ModalKind = "forgot" | "register" | null;

const COUNTDOWN_SECONDS = 60;

function VerifyCodeField({
  value,
  onChange,
  error,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string;
  onSubmit: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearInterval(timer.current);
  }, []);

  const sendCode = () => {
    if (secondsLeft > 0) return;
    setSecondsLeft(COUNTDOWN_SECONDS);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) window.clearInterval(timer.current);
        return s - 1;
      });
    }, 1000);
  };

  return (
    <Box>
      <FieldRow>
        <NativeInput
          placeholder="请输入验证码"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
        />
        <SolidPillButton onClick={sendCode} disabled={secondsLeft > 0}>
          {secondsLeft > 0 ? `${secondsLeft}s 后重发` : "获取验证码"}
        </SolidPillButton>
      </FieldRow>
      {error && <ErrorText>{error}</ErrorText>}
    </Box>
  );
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);

  const [resetAccount, setResetAccount] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const [registerAccount, setRegisterAccount] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!account.trim()) {
      setError("请输入邮箱或是手机号");
      return;
    }
    if (!password.trim()) {
      setError("请输入密码");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin(account.trim());
    }, 600);
  };

  const openModal = (kind: Exclude<ModalKind, null>) => {
    setResetError("");
    setRegisterError("");
    setModal(kind);
  };

  const closeModal = () => {
    setModal(null);
    setResetAccount("");
    setResetCode("");
    setResetPassword("");
    setRegisterAccount("");
    setRegisterCode("");
    setRegisterPassword("");
  };

  const handleReset = () => {
    setResetError("");
    if (!resetAccount.trim()) {
      setResetError("请输入邮箱或是手机号");
      return;
    }
    if (!resetCode.trim()) {
      setResetError("请输入验证码");
      return;
    }
    if (!resetPassword.trim()) {
      setResetError("请输入新密码");
      return;
    }
    closeModal();
    setError("");
    setAccount(resetAccount.trim());
  };

  const handleRegister = () => {
    setRegisterError("");
    if (!registerAccount.trim()) {
      setRegisterError("请输入邮箱或是手机号");
      return;
    }
    if (!registerCode.trim()) {
      setRegisterError("请输入验证码");
      return;
    }
    if (!registerPassword.trim()) {
      setRegisterError("请输入新密码");
      return;
    }
    closeModal();
    setError("");
    setAccount(registerAccount.trim());
    setPassword(registerPassword.trim());
  };

  const submitModal = () => {
    if (modal === "register") handleRegister();
    else handleReset();
  };

  return (
    <Page>
      <FormColumn>
        <Brand>SHEYUAN TECH</Brand>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldRow>
            <FieldIcon>
              <UserIcon />
            </FieldIcon>
            <NativeInput
              placeholder="请输入邮箱或是手机号"
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

        <ErrorText>{error}</ErrorText>

        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}>
          <LinkText onClick={() => openModal("forgot")}>忘记密码</LinkText>
          <LinkText onClick={() => openModal("register")}>注册账号</LinkText>
        </Box>
      </FormColumn>

      <Dialog
        fullScreen
        open={modal !== null}
        onClose={closeModal}
        slotProps={{ paper: { sx: { m: 0, backgroundColor: "#ffffff" } } }}
      >
        <DialogContent sx={{ p: 0 }}>
          <ModalPage>
            <CloseButton onClick={closeModal} aria-label="关闭">
              <CloseIcon />
            </CloseButton>
            <ModalBody>
              <ModalTitle>{modal === "register" ? "注册" : "忘记密码"}</ModalTitle>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <Box>
                  <FieldRow>
                    <NativeInput
                      placeholder="请输入邮箱或是手机号"
                      value={modal === "register" ? registerAccount : resetAccount}
                      onChange={(e) =>
                        modal === "register"
                          ? setRegisterAccount(e.target.value)
                          : setResetAccount(e.target.value)
                      }
                    />
                  </FieldRow>
                </Box>

                <VerifyCodeField
                  key={modal ?? "none"}
                  value={modal === "register" ? registerCode : resetCode}
                  onChange={modal === "register" ? setRegisterCode : setResetCode}
                  error=""
                  onSubmit={submitModal}
                />

                <FieldRow>
                  <NativeInput
                    placeholder="请输入新密码"
                    type="password"
                    value={modal === "register" ? registerPassword : resetPassword}
                    onChange={(e) =>
                      modal === "register"
                        ? setRegisterPassword(e.target.value)
                        : setResetPassword(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitModal();
                    }}
                  />
                </FieldRow>

                {(modal === "register" ? registerError : resetError) && (
                  <ErrorText sx={{ mt: 0 }}>
                    {modal === "register" ? registerError : resetError}
                  </ErrorText>
                )}

                <PillButton
                  fullWidth
                  sx={{ mt: 6 }}
                  onClick={submitModal}
                >
                  {modal === "register" ? "注册" : "确定"}
                </PillButton>
              </Box>
            </ModalBody>
          </ModalPage>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
