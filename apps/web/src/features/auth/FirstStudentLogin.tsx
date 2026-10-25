import { useState } from "react";
export function FirstStudentLogin({
  initialAccount,
  onDone,
  onBack,
}: {
  initialAccount: string;
  onDone: (account: string, password: string) => Promise<void>;
  onBack: () => void;
}) {
  const [account, setAccount] = useState(initialAccount),
    [name, setName] = useState(""),
    [challenge, setChallenge] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          if (challenge && password !== confirm)
            throw Error("两次密码不一致。");
          const r = await fetch(
            "/api/v1/student/first-login/" +
              (challenge ? "complete" : "verify"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                challenge
                  ? { challenge, password, confirmPassword: confirm }
                  : { account: account.trim(), name: name.trim() },
              ),
              signal: AbortSignal.timeout(30000),
            },
          );
          const result = await r.json();
          if (!r.ok) throw Error(result.error?.message ?? "操作失败，请重试。");
          if (challenge) {
            await onDone(result.account, password);
            setPassword("");
            setConfirm("");
          } else setChallenge(result.challenge);
        } catch (e) {
          setError(e instanceof Error ? e.message : "核验失败。");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{challenge ? "设置登录密码" : "首次登录"}</h3>
      <p>
        {challenge
          ? "核验成功。请设置个人密码，完成后使用学号和密码登录。"
          : "首次使用？通过学号和姓名激活账号。学号重复时使用教师提供的完整登录账号。"}
      </p>
      {challenge ? (
        <>
          <label>
            新密码
            <input
              aria-label="设置登录密码"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            确认新密码
            <input
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </label>
          <small>至少 8 位，请使用自己容易记住、他人难以猜到的密码。</small>
        </>
      ) : (
        <>
          <label>
            学号
            <input
              required
              type="text"
              autoComplete="username"
              maxLength={100}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            姓名
            <input
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="row-buttons">
        <button className="primary" disabled={busy}>
          {busy ? "处理中…" : challenge ? "设置密码并完成激活" : "核验身份"}
        </button>
        <button type="button" disabled={busy} onClick={onBack}>
          返回账号登录
        </button>
      </div>
    </form>
  );
}
