import { useEffect, useRef, useState } from "react";
import { classroomRequest } from "../classroom/cloud-request";
export function AccountSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<{
      name: string;
      studentNumber: string;
      mustChangePassword: boolean;
    }>(),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [forced, setForced] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    void classroomRequest("account")
      .then((r) => r.json())
      .then((p) => {
        if (active) {
          setProfile(p);
          setForced(p.mustChangePassword);
        }
      })
      .catch((e) => {
        if (active && open) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open]);
  useEffect(() => {
    if (open || forced) ref.current?.showModal();
    else ref.current?.close();
  }, [open, forced]);
  const close = () => {
    if (forced) {
      setError("请先修改教师提供的临时密码。");
      return;
    }
    if (
      (current || password || confirm) &&
      !window.confirm("密码修改尚未保存，确定放弃吗？")
    )
      return;
    setCurrent("");
    setPassword("");
    setConfirm("");
    onClose();
  };
  return (
    <dialog
      ref={ref}
      className="experience-auth-dialog"
      aria-label="账号设置"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <h2>账号设置</h2>
      <p>
        姓名：{profile?.name ?? "读取中…"} · 学号：
        {profile?.studentNumber ?? "读取中…"}（只读）
      </p>
      {forced && <p role="status">当前使用临时密码，请立即设置个人密码。</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          setNotice("");
          if (password !== confirm) {
            setError("两次新密码不一致。");
            return;
          }
          setBusy(true);
          try {
            await classroomRequest("account/password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                currentPassword: current,
                newPassword: password,
                confirmPassword: confirm,
              }),
            });
            if (forced) {
              window.location.reload();
              return;
            }
            setCurrent("");
            setPassword("");
            setConfirm("");
            setForced(false);
            setNotice("密码已修改。旧密码不再可用于登录。");
            window.dispatchEvent(new Event("classroom-account-changed"));
          } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败，输入已保留。");
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          [current, setCurrent, "当前密码", "current-password"],
          [password, setPassword, "新密码", "new-password"],
          [confirm, setConfirm, "确认新密码", "new-password"],
        ].map(([v, set, label, auto]) => (
          <label key={String(label)}>
            {String(label)}
            <input
              aria-label={String(label)}
              required
              type="password"
              autoComplete={String(auto)}
              maxLength={128}
              minLength={label === "当前密码" ? 1 : 8}
              value={String(v)}
              onChange={(e) => (set as typeof setCurrent)(e.target.value)}
              disabled={busy}
            />
          </label>
        ))}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button disabled={busy} className="primary">
          {busy ? "正在保存…" : "保存新密码"}
        </button>
        <button type="button" disabled={busy} onClick={close}>
          关闭
        </button>
      </form>
    </dialog>
  );
}
