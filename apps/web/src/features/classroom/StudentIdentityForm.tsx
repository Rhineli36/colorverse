import { useState } from "react";
import {
  StudentIdentitySchema,
  type StudentIdentity,
} from "@colorverse/contracts";
export function StudentIdentityForm({
  offline = false,
  onSave,
}: {
  offline?: boolean;
  onSave: (identity: StudentIdentity) => Promise<void>;
}) {
  const [studentNumber, setNumber] = useState(""),
    [realName, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="student-identity" aria-label="填写创作者身份">
      <p className="eyebrow">COLORVERSE · MY FIRST PLANET</p>
      <h1>为你的创作留下名字</h1>
      <p>
        {offline
          ? "让这颗星球有一个属于你的名字。展示体验可填写虚拟学号与姓名。"
          : "填写学号与姓名，让老师和同学认识你的创作。"}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = StudentIdentitySchema.safeParse({
            studentNumber,
            realName,
          });
          if (!r.success) {
            setError("请填写学号和姓名。");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await onSave(r.data);
          } catch (e) {
            setError(e instanceof Error ? e.message : "身份保存失败，请重试。");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          学号
          <input
            aria-label="学号"
            type="text"
            autoComplete="off"
            required
            maxLength={40}
            value={studentNumber}
            onChange={(e) => setNumber(e.target.value)}
          />
        </label>
        <label>
          姓名
          <input
            aria-label="姓名"
            type="text"
            required
            maxLength={60}
            value={realName}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "正在保存…" : "开始创造我的星球"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
