import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";

/** 一行 = 一个方格 + 文字，整行可点，方格切换勾选状态 */
const Line = styled("button")({
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 10px",
  border: "none",
  background: "none",
  cursor: "pointer",
  textAlign: "left",
  userSelect: "none",
  "&:hover": { backgroundColor: "rgba(63, 178, 255, 0.06)" },
});

/** 方格框固定常亮；勾选时整格填实，对勾用深色压在上面 */
const Square = styled("span")<{ $on: boolean }>(({ $on }) => ({
  position: "relative",
  width: 13,
  height: 13,
  flexShrink: 0,
  border: `1px solid ${HUD.cyan}`,
  boxShadow: "0 0 5px rgba(63, 178, 255, 0.3)",
  backgroundColor: $on ? HUD.cyan : "transparent",
  transition: "background-color 140ms ease",
  "&::after": {
    content: '""',
    position: "absolute",
    left: 4,
    top: 1,
    width: 3,
    height: 7,
    borderRight: `2px solid #04090f`,
    borderBottom: `2px solid #04090f`,
    transform: $on ? "rotate(42deg) scale(1)" : "rotate(42deg) scale(0)",
    opacity: $on ? 1 : 0,
    transition: "transform 140ms ease, opacity 140ms ease",
  },
}));

const Label = styled("span")({
  fontSize: 14,
  letterSpacing: 2,
  lineHeight: "20px",
  color: HUD.text,
  whiteSpace: "nowrap",
});

interface CheckLineProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export default function CheckLine({ label, checked, onChange }: CheckLineProps) {
  return (
    <Line type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}>
      <Square $on={checked} />
      <Label>{label}</Label>
    </Line>
  );
}
