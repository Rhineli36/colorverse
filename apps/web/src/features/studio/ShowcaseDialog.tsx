import { useEffect, useRef, useState } from "react";

export interface ShowcaseInput {
  title: string;
  description: string;
  tags: string[];
  file: File;
}
export function ShowcaseDialog({
  onSave,
  onClose,
}: {
  onSave: (input: ShowcaseInput) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [tags, setTags] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop">
      <form
        ref={dialog}
        className="modal showcase-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="添加展示作品"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !pending) onClose();
          if (e.key === "Tab") {
            if (pending) {
              e.preventDefault();
              return;
            }
            const items = [
              ...(dialog.current?.querySelectorAll<HTMLElement>(
                "input:not(:disabled), textarea:not(:disabled), button:not(:disabled)",
              ) ?? []),
            ];
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            }
            if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending || !file) return;
          const values = tags.split(/[，,\s]+/).filter(Boolean);
          if (values.length > 11 || values.some((t) => t.length > 24)) {
            setError("最多填写 11 个关键词，每个不超过 24 字");
            return;
          }
          setPending(true);
          setError("");
          try {
            await onSave({
              title: title.trim(),
              description: description.trim(),
              tags: values,
              file,
            });
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "保存失败，请重试");
          } finally {
            setPending(false);
          }
        }}
      >
        <p className="eyebrow">MY SHOWCASE · 自选作品</p>
        <h2>添加展示作品</h2>
        <p className="muted">
          挑选你想展示的色彩作品。保存档案后，可以选择为星球生成成长建议。
        </p>
        <fieldset disabled={pending}>
          <label>
            作品标题
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            作品图片
            <input
              required
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="muted">
            PNG / JPG / WebP，原图最大 20
            MiB。原图单独保留，不替换星球外观或内部背景。
          </p>
          <label>
            作品说明
            <textarea
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            色彩与情绪关键词
            <input
              maxLength={275}
              placeholder="例如：温暖 自然 蓝色"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
        </fieldset>
        <p className="muted">
          当前保存在此浏览器中，可随星球 ZIP 导出。不会把图片发送给
          AI；上传本身不代表公开发布授权。
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="showcase-actions">
          <button type="button" disabled={pending} onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={pending || !file || !title.trim()}
          >
            {pending ? "正在保存…" : "保存作品档案"}
          </button>
        </div>
      </form>
    </div>
  );
}
