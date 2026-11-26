import { useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material/styles";
import { HUD } from "../../theme/theme";
import { useNotification } from "../../contexts/NotificationContext";
import type { DeviceOption } from "../TaskInfo/NewTaskForm";
import type { DeviceCodeEntry } from "../../deviceCodes";

const MONO = '"Roboto Mono", "Consolas", monospace';

type AccountRole = "admin" | "operator" | "viewer";
type AccountStatus = "active" | "disabled";

interface Account {
  username: string;
  role: AccountRole;
  status: AccountStatus;
}

interface AuditEntry {
  time: string;
  action: string;
  actor: string;
  role: string;
  target: string;
}

const INITIAL_ACCOUNTS: Account[] = [
  { username: "admin1", role: "admin", status: "active" },
  { username: "operator1", role: "operator", status: "active" },
  { username: "viewer1", role: "viewer", status: "disabled" },
];

const INITIAL_AUDIT: AuditEntry[] = [
  { time: "09:27:40.118", action: "job.dispatch", actor: "admin1", role: "admin", target: "T-20261123-018" },
  { time: "09:27:31.546", action: "device.offline", actor: "—（服务端判定）", role: "—", target: "edge-demo-02" },
  { time: "09:26:44.270", action: "auth.forbidden", actor: "c47ea0ab…", role: "viewer", target: "POST /api/jobs" },
  { time: "09:26:44.102", action: "auth.login", actor: "admin1", role: "admin", target: "—" },
  { time: "09:26:43.981", action: "device.register", actor: "—（设备）", role: "—", target: "edge-demo-02" },
];

const ROLE_OPTIONS: AccountRole[] = ["admin", "operator", "viewer"];

const nowStamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(
    d.getMilliseconds(),
  ).padStart(3, "0")}`;
};

const Panel = styled("section")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
}));

const PanelHead = styled("div")({
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  flexWrap: "wrap",
  padding: "13px 16px 0",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.6,
  color: HUD.textDim,
});

const HeadHint = styled("span")({
  marginLeft: "auto",
  fontSize: 10.5,
  letterSpacing: 0.2,
  color: HUD.textDim,
  "@media (max-width: 900px)": { marginLeft: 0 },
});

const Body = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 16px 16px",
  minWidth: 0,
});

const BtnRow = styled("div")({
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 2,
});

const Btn = styled("button")<{ $primary?: boolean; $danger?: boolean }>(
  ({ $primary, $danger }) => ({
    height: 28,
    padding: "0 12px",
    borderRadius: 4,
    fontSize: 11.5,
    letterSpacing: 0.4,
    cursor: "pointer",
    border: `1px solid ${$danger ? "rgba(245, 73, 102, 0.55)" : $primary ? HUD.cyan : HUD.line}`,
    background: $danger
      ? "rgba(245, 73, 102, 0.10)"
      : $primary
        ? "rgba(63, 178, 255, 0.14)"
        : "transparent",
    color: $danger ? HUD.danger : $primary ? HUD.cyan : HUD.textDim,
    whiteSpace: "nowrap",
    transition: "background-color 140ms ease, color 140ms ease, border-color 140ms ease",
    "&:hover": {
      borderColor: $danger ? HUD.danger : HUD.lineStrong,
      color: $danger ? "#ffffff" : $primary ? HUD.cyan : HUD.text,
      backgroundColor: $danger
        ? "rgba(245, 73, 102, 0.24)"
        : $primary
          ? "rgba(63, 178, 255, 0.22)"
          : "rgba(255, 255, 255, 0.04)",
    },
    "&:disabled": { opacity: 0.4, cursor: "not-allowed" },
  }),
);

const TableWrap = styled("div")({
  minWidth: 0,
  overflowX: "auto",
});

const Table = styled("table")({
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
  "& th": {
    padding: "7px 8px",
    textAlign: "left",
    fontSize: 10.5,
    fontWeight: 500,
    letterSpacing: 0.4,
    color: HUD.textDim,
    borderBottom: `1px solid ${HUD.line}`,
    whiteSpace: "nowrap",
  },
  "& td": {
    padding: "8px",
    color: HUD.text,
    borderBottom: `1px solid ${HUD.lineSoft}`,
    whiteSpace: "nowrap",
  },
  "& tbody tr:last-of-type td": { borderBottom: "none" },
  "& .mono": { fontFamily: MONO, fontSize: 11.5, fontVariantNumeric: "tabular-nums" },
  "& .dim": { color: HUD.textDim },
});

const AccountTr = styled("tr")<{ $active: boolean }>(({ $active }) => ({
  cursor: "pointer",
  "& td": $active
    ? {
        backgroundColor: "rgba(63, 178, 255, 0.06)",
      }
    : {},
  "& td:first-of-type": $active ? { boxShadow: `inset 2px 0 0 ${HUD.cyan}` } : {},
  "&:hover td": { backgroundColor: "rgba(63, 178, 255, 0.09)" },
}));

const StatusTag = styled("span")<{ $on: boolean }>(({ $on }) => ({
  display: "inline-flex",
  alignItems: "center",
  height: 18,
  padding: "0 7px",
  borderRadius: 5,
  border: `1px solid ${$on ? HUD.ok : HUD.textDim}40`,
  backgroundColor: $on ? `${HUD.ok}0f` : "rgba(126, 162, 205, 0.08)",
  color: $on ? HUD.ok : HUD.textDim,
  fontSize: 10,
  letterSpacing: 0.3,
}));

const AddForm = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
});

const SmallInput = styled("input")({
  width: 124,
  height: 28,
  boxSizing: "border-box",
  padding: "0 8px",
  borderRadius: 4,
  border: `1px solid ${HUD.line}`,
  background: "rgba(4, 9, 15, 0.8)",
  color: HUD.text,
  fontSize: 12,
  outline: "none",
  "&:focus": { borderColor: HUD.lineStrong },
});

const SmallSelect = styled("select")({
  height: 28,
  boxSizing: "border-box",
  padding: "0 6px",
  borderRadius: 4,
  border: `1px solid ${HUD.line}`,
  background: "rgba(4, 9, 15, 0.8)",
  color: HUD.text,
  fontSize: 11.5,
  outline: "none",
  colorScheme: "dark",
  "&:focus": { borderColor: HUD.lineStrong },
});

const HintText = styled("div")({
  fontSize: 10.5,
  lineHeight: 1.7,
  letterSpacing: 0.2,
  color: HUD.textDim,
});

const CodeError = styled("span")({
  fontSize: 11,
  color: HUD.danger,
});

const EmptyRow = styled("div")({
  padding: "12px 0",
  fontSize: 11,
  color: HUD.textDim,
});

/** 删除账号的二次确认弹层 */
const Overlay = styled("div")({
  position: "fixed",
  inset: 0,
  zIndex: 1400,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  backgroundColor: "rgba(2, 6, 12, 0.78)",
});

const Dialog = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: "min(380px, 100%)",
  padding: "18px 20px 16px",
  border: `1px solid ${HUD.line}`,
  borderRadius: 8,
  backgroundColor: HUD.panel,
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
});

const DialogTitle = styled("h3")({
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.4,
  color: HUD.text,
});

const DialogText = styled("p")({
  margin: 0,
  fontSize: 12,
  lineHeight: 1.8,
  color: HUD.textDim,
  "& b": { color: HUD.text, fontWeight: 500 },
});

const DialogActions = styled("div")({
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 4,
});

export default function SettingsTab({
  codes,
  devices,
  onAddCode,
  onRemoveCode,
}: {
  codes: DeviceCodeEntry[];
  devices: DeviceOption[];
  onAddCode: (code: string) => { ok: true; id: string } | { ok: false; message: string };
  onRemoveCode: (id: string) => void;
}) {
  const { notify } = useNotification();
  const [accounts, setAccounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [selectedAccount, setSelectedAccount] = useState<string | null>("admin1");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AccountRole>("operator");
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [newCode, setNewCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [pendingCode, setPendingCode] = useState<DeviceCodeEntry | null>(null);
  const [roleFilter, setRoleFilter] = useState("全部角色");
  const [actionFilter, setActionFilter] = useState("全部动作");

  const selected = accounts.find((a) => a.username === selectedAccount) ?? null;
  const actionOptions = useMemo(
    () => Array.from(new Set(audit.map((a) => a.action))),
    [audit],
  );
  const filteredAudit = audit.filter(
    (a) =>
      (roleFilter === "全部角色" || a.role === roleFilter) &&
      (actionFilter === "全部动作" || a.action === actionFilter),
  );

  const toggleSelected = () => {
    if (!selected) return;
    const activeAdmins = accounts.filter(
      (a) => a.role === "admin" && a.status === "active",
    ).length;
    if (selected.status === "active" && selected.role === "admin" && activeAdmins <= 1) {
      notify("至少保留一个启用中的管理员账号", "error");
      return;
    }
    const nextStatus: AccountStatus = selected.status === "active" ? "disabled" : "active";
    setAccounts((prev) =>
      prev.map((a) => (a.username === selected.username ? { ...a, status: nextStatus } : a)),
    );
    notify(`${selected.username} 已${nextStatus === "active" ? "启用" : "停用"}`, "success");
  };

  /** 点删除先弹二次确认，确认后才真正移除 */
  const requestDelete = () => {
    if (!selected) return;
    const activeAdmins = accounts.filter(
      (a) => a.role === "admin" && a.status === "active",
    ).length;
    if (selected.role === "admin" && activeAdmins <= 1) {
      notify("至少保留一个启用中的管理员账号", "error");
      return;
    }
    setPendingDelete(selected);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const removed = pendingDelete.username;
    const rest = accounts.filter((a) => a.username !== removed);
    setAccounts(rest);
    setAudit((prev) =>
      [
        {
          time: nowStamp(),
          action: "user.delete",
          actor: "admin",
          role: "admin",
          target: removed,
        },
        ...prev,
      ].slice(0, 5),
    );
    setSelectedAccount(rest[0]?.username ?? null);
    setPendingDelete(null);
    notify(`已删除账号 ${removed}`, "success");
  };

  useEffect(() => {
    if (!pendingDelete && !pendingCode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPendingDelete(null);
        setPendingCode(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, pendingCode]);

  /** 登记设备码：校验格式后交给全局设备码库，配对页据此放行 */
  const submitCode = () => {
    const value = newCode.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{5,}$/.test(value)) {
      setCodeError("设备码至少 6 位，仅限字母、数字与连字符");
      return;
    }
    const result = onAddCode(value);
    if (!result.ok) {
      setCodeError(result.message);
      return;
    }
    setAudit((prev) =>
      [
        {
          time: nowStamp(),
          action: "device.code.add",
          actor: "admin",
          role: "admin",
          target: `${result.id} · ${value}`,
        },
        ...prev,
      ].slice(0, 5),
    );
    setNewCode("");
    setCodeError("");
    notify(`已登记 ${result.id}（${value}），配对时将按此设备码校验`, "success");
  };

  const confirmRemoveCode = () => {
    if (!pendingCode) return;
    onRemoveCode(pendingCode.id);
    setAudit((prev) =>
      [
        {
          time: nowStamp(),
          action: "device.code.remove",
          actor: "admin",
          role: "admin",
          target: `${pendingCode.id} · ${pendingCode.code}`,
        },
        ...prev,
      ].slice(0, 5),
    );
    notify(`已移除 ${pendingCode.id} 的设备码，配对校验将不再通过`, "info");
    setPendingCode(null);
  };

  const createAccount = () => {
    const name = newName.trim();
    if (!name) {
      notify("请输入账号", "error");
      return;
    }
    if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
      notify("账号已存在", "error");
      return;
    }
    if (newPassword.length < 6) {
      notify("初始密码至少 6 位", "error");
      return;
    }
    setAccounts((prev) => [...prev, { username: name, role: newRole, status: "active" }]);
    setAudit((prev) =>
      [
        { time: nowStamp(), action: "user.create", actor: "admin", role: "admin", target: name },
        ...prev,
      ].slice(0, 5),
    );
    setSelectedAccount(name);
    setAdding(false);
    setNewName("");
    setNewPassword("");
    setNewRole("operator");
    notify(`已创建账号 ${name}（${newRole}），可用该密码登录`, "success");
  };

  return (
    <>
      <Panel>
        <PanelHead>
          账号
          <HeadHint>由管理员开设与停用，不开放注册</HeadHint>
        </PanelHead>
          <Body>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>账号</th>
                    <th>角色</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <AccountTr
                      key={account.username}
                      $active={account.username === selectedAccount}
                      onClick={() => setSelectedAccount(account.username)}
                    >
                      <td>{account.username}</td>
                      <td className="dim">{account.role}</td>
                      <td>
                        <StatusTag $on={account.status === "active"}>{account.status}</StatusTag>
                      </td>
                    </AccountTr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            {adding ? (
              <AddForm>
                <SmallInput
                  autoFocus
                  value={newName}
                  placeholder="新账号"
                  aria-label="新账号用户名"
                  onChange={(e) => setNewName(e.target.value)}
                />
                <SmallInput
                  type="password"
                  value={newPassword}
                  placeholder="初始密码（≥6 位）"
                  aria-label="新账号初始密码"
                  autoComplete="new-password"
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <SmallSelect
                  value={newRole}
                  aria-label="新账号角色"
                  onChange={(e) => setNewRole(e.target.value as AccountRole)}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </SmallSelect>
                <Btn type="button" $primary onClick={createAccount}>
                  创建
                </Btn>
                <Btn
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                    setNewPassword("");
                  }}
                >
                  取消
                </Btn>
              </AddForm>
            ) : (
              <BtnRow>
                <Btn type="button" $primary onClick={() => setAdding(true)}>
                  新建账号
                </Btn>
                <Btn type="button" onClick={toggleSelected} disabled={!selected}>
                  {selected && selected.status === "active" ? "停用" : "启用"}
                </Btn>
                <Btn type="button" $danger onClick={requestDelete} disabled={!selected}>
                  删除
                </Btn>
              </BtnRow>
            )}
            <HintText>新建账号时设置初始密码，创建后即可用该密码登录；密码不在列表中回显。</HintText>
          </Body>
        </Panel>

      <Panel style={{ marginTop: 12 }}>
        <PanelHead>
          设备码库
          <HeadHint>配对时按库内设备码校验，未登记不建立连接</HeadHint>
        </PanelHead>
        <Body>
          <AddForm>
            <SmallInput
              value={newCode}
              maxLength={20}
              placeholder="设备码，如 SH-01-4F2A"
              aria-label="新增设备码"
              style={{
                width: 220,
                fontFamily: MONO,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
              onChange={(e) => {
                setNewCode(e.target.value);
                setCodeError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCode();
              }}
            />
            <Btn type="button" $primary onClick={submitCode}>
              登记设备码
            </Btn>
            {codeError && <CodeError>{codeError}</CodeError>}
          </AddForm>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>设备号</th>
                  <th>设备码</th>
                  <th>接入</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((entry) => {
                  const linked = Boolean(devices.find((d) => d.id === entry.id)?.paired);
                  return (
                    <tr key={entry.id}>
                      <td>{entry.id}</td>
                      <td className="mono">{entry.code}</td>
                      <td>
                        <StatusTag $on={linked}>{linked ? "已连接" : "待接入"}</StatusTag>
                      </td>
                      <td>
                        <Btn
                          type="button"
                          $danger
                          style={{ height: 22, padding: "0 8px", fontSize: 10.5 }}
                          onClick={() => setPendingCode(entry)}
                        >
                          移除
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
          {codes.length === 0 && <EmptyRow>设备码库为空，设备配对将无法通过校验</EmptyRow>}
          <HintText>
            设备码由设备上电后随热点返回；登记后分配新设备号并出现在「设备配对」。移除会断开该设备已建立的连接。
          </HintText>
        </Body>
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <PanelHead>
          审计流水（最新 5 条）
          <HeadHint>
            <SmallSelect
              value={roleFilter}
              aria-label="按角色筛选审计"
              style={{ marginRight: 6 }}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="全部角色">全部角色</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </SmallSelect>
            <SmallSelect
              value={actionFilter}
              aria-label="按动作筛选审计"
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="全部动作">全部动作</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </SmallSelect>
          </HeadHint>
        </PanelHead>
        <Body>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>动作</th>
                  <th>操作者 / 角色</th>
                  <th>目标</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.map((entry, index) => (
                  <tr key={`${entry.time}-${entry.action}-${index}`}>
                    <td className="mono">{entry.time}</td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.actor} / <span className="dim">{entry.role}</span>
                    </td>
                    <td className="mono">{entry.target}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          {filteredAudit.length === 0 && <EmptyRow>没有符合条件的审计记录</EmptyRow>}
          <HintText>
            失败场景按 401/403/409/410/502 记录；停用账号的登录会被拒绝并写入审计。
          </HintText>
        </Body>
      </Panel>

      {pendingDelete && (
        <Overlay onClick={() => setPendingDelete(null)} role="presentation">
          <Dialog
            role="alertdialog"
            aria-modal="true"
            aria-label="确认删除账号"
            onClick={(e) => e.stopPropagation()}
          >
            <DialogTitle>删除账号</DialogTitle>
            <DialogText>
              确定删除账号 <b>{pendingDelete.username}</b>（{pendingDelete.role}）？
              删除后该账号将从列表移除，操作会写入审计流水。
            </DialogText>
            <DialogActions>
              <Btn type="button" onClick={() => setPendingDelete(null)}>
                取消
              </Btn>
              <Btn type="button" $danger onClick={confirmDelete}>
                确认删除
              </Btn>
            </DialogActions>
          </Dialog>
        </Overlay>
      )}

      {pendingCode && (
        <Overlay onClick={() => setPendingCode(null)} role="presentation">
          <Dialog
            role="alertdialog"
            aria-modal="true"
            aria-label="确认移除设备码"
            onClick={(e) => e.stopPropagation()}
          >
            <DialogTitle>移除设备码</DialogTitle>
            <DialogText>
              确定移除 <b>{pendingCode.id}</b> 的设备码 <b>{pendingCode.code}</b>？
              移除后该设备配对将无法通过校验，已建立的连接会被断开，操作会写入审计流水。
            </DialogText>
            <DialogActions>
              <Btn type="button" onClick={() => setPendingCode(null)}>
                取消
              </Btn>
              <Btn type="button" $danger onClick={confirmRemoveCode}>
                确认移除
              </Btn>
            </DialogActions>
          </Dialog>
        </Overlay>
      )}
    </>
  );
}