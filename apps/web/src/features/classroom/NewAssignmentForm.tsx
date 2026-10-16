import { useEffect, useRef, useState } from "react";
import {
  AssignmentDefinitionSchema,
  CustomAssignmentFields,
  type CustomAssignmentDraft,
} from "@colorverse/contracts";
import { AssignmentBrief } from "./AssignmentBrief";
export function NewAssignmentForm({
  onCreate,
  onBack,
  onDirtyChange,
}: {
  onCreate: (
    draft: CustomAssignmentDraft,
    image: File | null,
    requestId: string,
  ) => Promise<void>;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    steps: "",
    deliverables: "",
    inspiration: "",
    exampleObservation: "",
  });
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    onDirtyChange(!!file || Object.values(draft).some(Boolean));
    return () => onDirtyChange(false);
  }, [draft, file, onDirtyChange]);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  const validate = () =>
    CustomAssignmentFields.parse({
      ...draft,
      steps: draft.steps
        .split("\n")
        .map((s) => s.trim().replace(/^\d+[.、]\s*/, ""))
        .filter(Boolean),
    });
  return (
    <section className="new-assignment" aria-label="新增作业">
      <h3>新增作业</h3>
      {!preview ? (
        <div className="assignment-fields">
          {(
            [
              ["title", "作业标题"],
              ["description", "作业要求"],
              ["steps", "创作步骤（每行一步）"],
              ["deliverables", "提交内容"],
              ["inspiration", "灵感入口（可选）"],
              ["exampleObservation", "范例观察（可选）"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              {key === "title" ? (
                <input
                  aria-label={label}
                  maxLength={120}
                  value={draft[key]}
                  disabled={busy}
                  onChange={(e) => {
                    requestId.current = crypto.randomUUID();
                    setDraft({ ...draft, [key]: e.target.value });
                  }}
                />
              ) : (
                <textarea
                  aria-label={label}
                  rows={key === "steps" ? 5 : 3}
                  maxLength={
                    key === "steps" ? 5000 : key === "inspiration" ? 500 : 2000
                  }
                  value={draft[key]}
                  disabled={busy}
                  onChange={(e) => {
                    requestId.current = crypto.randomUUID();
                    setDraft({ ...draft, [key]: e.target.value });
                  }}
                />
              )}
            </label>
          ))}
          <label>
            上传示范图片（可选）
            <input
              aria-label="上传作业示范图片"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (
                  f &&
                  (!["image/png", "image/jpeg", "image/webp"].includes(
                    f.type,
                  ) ||
                    f.size > 8388608)
                ) {
                  setError("请选择8MB以内的PNG、JPEG或WebP图片");
                  return;
                }
                setError("");
                requestId.current = crypto.randomUUID();
                setFile(f);
              }}
            />
          </label>
          {file && (
            <div className="assignment-file-preview">
              <img src={url} alt="新增作业示范预览" />
              <span>{file.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  requestId.current = crypto.randomUUID();
                  setFile(null);
                }}
              >
                移除图片
              </button>
            </div>
          )}
        </div>
      ) : (
        <AssignmentBrief
          task={AssignmentDefinitionSchema.parse({
            ...validate(),
            id: `custom-${requestId.current}`,
            image: url,
          })}
          showTitle
        />
      )}
      {error && <p role="alert">{error}</p>}
      <footer className="assignment-mail-actions">
        <button disabled={busy} onClick={onBack}>
          返回模板
        </button>
        <div className="assignment-create-actions">
          <button
            disabled={busy}
            onClick={() => {
              if (preview) {
                setPreview(false);
                return;
              }
              try {
                validate();
                setError("");
                setPreview(true);
              } catch {
                setError(
                  "请填写标题、作业要求和提交内容；步骤最多10行，每行不超过500字。",
                );
              }
            }}
          >
            {preview ? "继续编辑" : "预览作业"}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              let value: CustomAssignmentDraft;
              try {
                value = validate();
              } catch {
                setError(
                  "请填写标题、作业要求和提交内容；步骤最多10行，每行不超过500字。",
                );
                return;
              }
              setBusy(true);
              setError("");
              void onCreate(value, file, requestId.current)
                .catch((e) =>
                  setError(e instanceof Error ? e.message : "发布失败，请重试"),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "正在发布…" : "发布新作业"}
          </button>
        </div>
      </footer>
    </section>
  );
}
