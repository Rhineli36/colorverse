import { useState } from "react";

export function StudentActivation({
  initialAccount,
  onDone,
  onBack,
}: {
  initialAccount: string;
  onDone: (account: string) => void;
  onBack: () => void;
}) {
  const [account, setAccount] = useState(initialAccount),
    [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (password !== confirm) {
          setMessage("两次填写的密码不一致");
          return;
        }
        setBusy(true);
        setMessage("");
        try {
          const r = await fetch("/api/v1/student/activate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account: account.trim(), code, password }),
              signal: AbortSignal.timeout(30000),
            }),
            data = await r.json();
          if (!r.ok) throw Error(data.error?.message || "激活暂未完成，请重试");
          setPassword("");
          setConfirm("");
          onDone(data.account);
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "激活暂未完成，请重试");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>首次激活学生账号</h3>
      <p>
        填写老师提供的账号和首次激活码，设置自己的登录密码。激活码仅使用一次。
      </p>
      <label>
        账号
        <input
          autoComplete="username"
          value={account}
          required
          maxLength={100}
          disabled={busy}
          onChange={(e) => setAccount(e.target.value)}
        />
      </label>
      <label>
        首次激活码
        <input
          autoComplete="one-time-code"
          value={code}
          required
          maxLength={80}
          disabled={busy}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <label>
        设置密码
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          required
          minLength={8}
          maxLength={128}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        确认密码
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          required
          minLength={8}
          maxLength={128}
          disabled={busy}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <p className="muted">至少 8 位，建议使用字母和数字。</p>
      {message && <p role="alert">{message}</p>}
      <div className="row-buttons">
        <button className="primary" disabled={busy}>
          {busy ? "正在激活…" : "激活并设置密码"}
        </button>
        <button type="button" disabled={busy} onClick={onBack}>
          返回登录
        </button>
      </div>
    </form>
  );
}
