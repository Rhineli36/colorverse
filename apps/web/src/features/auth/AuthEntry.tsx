import { useEffect, useRef, useState } from "react";
import { getAuthClient, loginError } from "./auth-client";
import "./auth.css";

export function AuthEntry() {
  const [client] = useState(getAuthClient);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identity, setIdentity] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    if (!client) return;
    let active = true;
    const refresh = async () => {
      const current = ++generation.current;
      try {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (!active || current !== generation.current) return;
        setHasSession(Boolean(session));
        if (!session) {
          setIdentity(null);
          setMessage("");
          return;
        }
        const response = await fetch("/api/v1/cloud/session", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (!active || current !== generation.current) return;
        if (response.status === 401) {
          setIdentity(null);
          setMessage("登录已失效，请重新登录");
          return;
        }
        if (!response.ok) throw new Error("unavailable");
        const result = await response.json();
        if (!active || current !== generation.current) return;
        if (
          typeof result.identity?.email !== "string" ||
          result.access !== "pending-enrollment"
        )
          throw new Error("invalid response");
        setIdentity(result.identity.email);
        setMessage("身份已验证，待加入班级。当前星球和作品仍保存在本机。");
      } catch {
        if (active && current === generation.current) {
          setIdentity(null);
          setMessage(
            "暂时无法验证云端身份，请稍后重试。当前仍可浏览本机演示。",
          );
        }
      } finally {
        if (active && current === generation.current) setChecking(false);
      }
    };
    // Do not call asynchronous auth methods inside the SDK's locked callback.
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      queueMicrotask(() => {
        if (active) void refresh();
      });
    });
    void refresh();
    return () => {
      active = false;
      generation.current++;
      subscription.unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      emailInput.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  if (!client) return null;
  const close = () => {
    setPassword("");
    setOpen(false);
  };
  return (
    <>
      <button
        className="outline small cloud-login-entry"
        onClick={() => setOpen(true)}
      >
        {checking ? "验证登录…" : hasSession ? "我的云端账户" : "登录"}
      </button>
      <dialog
        className="auth-dialog"
        ref={dialog}
        aria-labelledby="auth-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) close();
        }}
      >
        <button
          className="modal-close"
          aria-label="关闭登录"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
        <p className="eyebrow">COLORVERSE · CONNECT</p>
        <h2 id="auth-title">
          {hasSession ? "你的宇宙身份" : "登录你的色彩宇宙"}
        </h2>
        <p className="muted">学生和教师使用课堂邮箱登录。游客可以直接浏览。</p>
        {hasSession ? (
          <>
            <p className="auth-identity">{identity ?? "身份等待验证"}</p>
            <p role="status">{message}</p>
            <button
              className="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const { error } = await client.auth.signOut({
                    scope: "local",
                  });
                  if (error) setMessage("退出失败，请稍后重试");
                  else {
                    setIdentity(null);
                    setHasSession(false);
                    setPassword("");
                    setMessage("已退出云端账户");
                  }
                } catch {
                  setMessage("退出失败，请稍后重试");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在退出…" : "退出登录"}
            </button>
          </>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setMessage("");
              const submittedPassword = password;
              setPassword("");
              try {
                const { error } = await client.auth.signInWithPassword({
                  email: email.trim(),
                  password: submittedPassword,
                });
                if (error) setMessage(loginError(error.status, error.code));
              } catch {
                setMessage(loginError());
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              课堂邮箱
              <input
                ref={emailInput}
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {message && <p role="status">{message}</p>}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "正在登录…" : "登录"}
            </button>
          </form>
        )}
        <p className="auth-pilot-note">
          云端登录测试阶段 · 班级权限与云端保存正在接入
        </p>
        <button className="outline" disabled={busy} onClick={close}>
          继续浏览
        </button>
      </dialog>
    </>
  );
}
