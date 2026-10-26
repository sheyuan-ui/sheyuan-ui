import { styled } from "@mui/material/styles";

const Page = styled("div")(({ theme }) => ({
  flex: 1,
  overflow: "auto",
  backgroundColor: theme.palette.background.default,
}));

/** 设备信息页：待确认要展示哪些信息，暂时留空 */
export default function DevicePage() {
  return <Page />;
}
