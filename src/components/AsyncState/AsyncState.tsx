import type { ReactNode } from "react";
import { Button, CircularProgress } from "@mui/material";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { isApiRequestError } from "../../api/errors";

interface AsyncStateProps {
  loading: boolean;
  error: unknown;
  /** 错误态的重试入口；不传则不显示按钮 */
  onRetry?: () => void;
  /** 请求成功但数据为空 */
  empty?: boolean;
  emptyText?: string;
  loadingText?: string;
  children: ReactNode;
}

const StateBox = styled("div")({
  width: "100%",
  flex: 1,
  minHeight: 140,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "28px 16px",
  textAlign: "center",
});

const StateText = styled("div")({
  fontSize: 12.5,
  color: HUD.textDim,
});

const ErrorText = styled("div")({
  fontSize: 12.5,
  color: HUD.danger,
  maxWidth: 360,
});

const RetryButton = styled(Button)({
  minWidth: 64,
  height: 28,
  padding: "0 14px",
  fontSize: 12,
  borderColor: HUD.lineStrong,
  color: HUD.cyan,
  "&:hover": {
    borderColor: HUD.cyan,
    backgroundColor: "rgba(63, 178, 255, 0.10)",
  },
});

function errorMessage(error: unknown): string {
  if (isApiRequestError(error)) return error.message;
  return "加载失败，请稍后重试";
}

/** 页面取数的统一加载 / 错误 / 空态；配合 useRequest 使用。 */
export default function AsyncState({
  loading,
  error,
  onRetry,
  empty = false,
  emptyText = "暂无数据",
  loadingText = "加载中",
  children,
}: AsyncStateProps) {
  if (loading) {
    return (
      <StateBox role="status">
        <CircularProgress size={18} thickness={3} sx={{ color: HUD.cyan }} />
        <StateText>{loadingText}</StateText>
      </StateBox>
    );
  }

  if (error !== null && error !== undefined) {
    return (
      <StateBox role="alert">
        <ErrorText>{errorMessage(error)}</ErrorText>
        {onRetry && (
          <RetryButton variant="outlined" size="small" onClick={onRetry}>
            重试
          </RetryButton>
        )}
      </StateBox>
    );
  }

  if (empty) {
    return (
      <StateBox>
        <StateText>{emptyText}</StateText>
      </StateBox>
    );
  }

  return <>{children}</>;
}