import { useEffect } from "react";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";

export interface Attachment {
  name: string;
  /** 本地选择文件后生成的 object URL；演示附件没有 */
  url?: string;
  mime?: string;
}

type Kind = "image" | "pdf" | "other";

const imageExt = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

const kindOf = (file: Attachment): Kind => {
  const mime = file.mime ?? "";
  if (mime.startsWith("image/") || imageExt.test(file.name)) return "image";
  if (mime === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  return "other";
};

const Overlay = styled("div")({
  position: "fixed",
  inset: 0,
  zIndex: 1400,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  backgroundColor: "rgba(2, 6, 12, 0.78)",
  "@media (max-width: 760px)": { padding: 12 },
});

const Panel = styled("div")({
  display: "flex",
  flexDirection: "column",
  width: "min(880px, 100%)",
  maxHeight: "88vh",
  border: `1px solid ${HUD.line}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
});

const Head = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 16px",
  borderBottom: `1px solid ${HUD.line}`,
});

const Name = styled("span")({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 13,
  color: HUD.text,
});

const Spacer = styled("i")({ flex: 1 });

const Download = styled("a")({
  flexShrink: 0,
  fontSize: 11.5,
  letterSpacing: 0.4,
  color: HUD.cyan,
  textDecoration: "none",
  border: `1px solid ${HUD.line}`,
  borderRadius: 4,
  padding: "3px 10px",
  transition: "border-color 140ms ease, background-color 140ms ease",
  "&:hover": { borderColor: HUD.lineStrong, backgroundColor: "rgba(63, 178, 255, 0.08)" },
});

const Close = styled("button")({
  flexShrink: 0,
  width: 26,
  height: 26,
  border: `1px solid ${HUD.line}`,
  borderRadius: 4,
  background: "transparent",
  color: HUD.textDim,
  fontSize: 15,
  lineHeight: 1,
  cursor: "pointer",
  "&:hover": { color: HUD.text, borderColor: HUD.lineStrong },
});

const Body = styled("div")({
  flex: 1,
  minHeight: 220,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "auto",
  padding: 16,
  "& img": { maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" },
  "& iframe": { width: "100%", height: "68vh", border: "none", backgroundColor: "#ffffff" },
});

const Fallback = styled("div")({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "36px 24px",
  textAlign: "center",
  "& > b": {
    fontFamily: '"Roboto Mono", "Consolas", monospace',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.3,
    color: HUD.text,
    wordBreak: "break-all",
  },
  "& > span": { fontSize: 12, lineHeight: 1.8, color: HUD.textDim, maxWidth: 380 },
});

interface AttachmentDialogProps {
  attachment: Attachment | null;
  onClose: () => void;
}

export default function AttachmentDialog({ attachment, onClose }: AttachmentDialogProps) {
  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachment, onClose]);

  if (!attachment) return null;
  const kind = kindOf(attachment);

  return (
    <Overlay onClick={onClose} role="presentation">
      <Panel
        role="dialog"
        aria-modal="true"
        aria-label={`附件预览 ${attachment.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Head>
          <Name>{attachment.name}</Name>
          <Spacer />
          {attachment.url && (
            <Download href={attachment.url} download={attachment.name}>
              下载
            </Download>
          )}
          <Close type="button" onClick={onClose} aria-label="关闭预览">
            ×
          </Close>
        </Head>
        <Body>
          {kind === "image" && attachment.url ? (
            <img src={attachment.url} alt={attachment.name} />
          ) : kind === "pdf" && attachment.url ? (
            <iframe src={attachment.url} title={attachment.name} />
          ) : (
            <Fallback>
              <b>{attachment.name}</b>
              <span>
                {attachment.url
                  ? "该类型暂不支持在线预览，可点击上方「下载」查看。"
                  : "演示附件：本原型未包含文件内容，点击入口可打开此预览。"}
              </span>
            </Fallback>
          )}
        </Body>
      </Panel>
    </Overlay>
  );
}