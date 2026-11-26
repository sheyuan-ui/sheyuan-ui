import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import type { DeviceOption } from "../TaskInfo/NewTaskForm";
import type { DeviceCodeEntry } from "../../deviceCodes";
import SettingsTab from "./SettingsTab";

const Page = styled("div")(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  backgroundColor: theme.palette.background.default,
  padding: "18px 22px 28px",
  "@media (max-width: 720px)": { padding: "14px 12px 22px" },
}));

const Shell = styled("div")({
  width: "100%",
  maxWidth: 1320,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 14,
});

const PageHead = styled("div")({
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  "& h1": {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: 0.3,
    color: HUD.text,
  },
  "& p": {
    margin: "5px 0 0",
    fontSize: 11,
    letterSpacing: 0.2,
    color: HUD.textDim,
  },
});

interface SettingsPageProps {
  codes: DeviceCodeEntry[];
  devices: DeviceOption[];
  onAddCode: (code: string) => { ok: true; id: string } | { ok: false; message: string };
  onRemoveCode: (id: string) => void;
}

export default function SettingsPage({
  codes,
  devices,
  onAddCode,
  onRemoveCode,
}: SettingsPageProps) {
  return (
    <Page>
      <Shell>
        <PageHead>
          <div>
            <h1>设置</h1>
            <p>仅管理员可访问 · 设备码、账号管理与审计流水</p>
          </div>
        </PageHead>
        <SettingsTab
          codes={codes}
          devices={devices}
          onAddCode={onAddCode}
          onRemoveCode={onRemoveCode}
        />
      </Shell>
    </Page>
  );
}