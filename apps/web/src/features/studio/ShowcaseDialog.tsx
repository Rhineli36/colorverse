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
    [error, setError] = useState(""),
    [preview, setPreview] = useState(""),
    [dimensions, setDimensions] = useState("");
  const dialog = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      setDimensions("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setDimensions("");
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
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
        <div className="showcase-dialog-content">
          <p className="eyebrow">MY SHOWCASE · 自选作品</p>
          <h2>添加展示作品</h2>
          <p className="muted">
            挑选你想展示的色彩作品。提交后，星球会自动长出一个小元素；点击它可以编辑，不影响原作。
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
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  setError("");
                  if (selected && selected.size > 20 * 1024 * 1024) {
                    setError("图片超过 20 MiB，请选择更小的图片");
                    setFile(null);
                    return;
                  }
                  setFile(selected);
                  if (selected && !title.trim())
                    setTitle(
                      selected.name.replace(/\.[^.]+$/, "").slice(0, 120),
                    );
                }}
              />
            </label>
            {preview && (
              <figure className="showcase-upload-preview">
                <img
                  src={preview}
                  alt="待上传作品预览"
                  onLoad={(e) =>
                    setDimensions(
                      `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`,
                    )
                  }
                  onError={() =>
                    setError("图片无法预览，请更换有效的 PNG、JPG 或 WebP 图片")
                  }
                />
                <figcaption>
                  {file?.name} · {dimensions} ·{" "}
                  {((file?.size ?? 0) / 1024 / 1024).toFixed(2)} MiB
                </figcaption>
              </figure>
            )}
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
        </div>
        <footer className="showcase-dialog-footer">
          {error && <p role="alert">{error}</p>}
          <div className="showcase-actions">
            <button type="button" disabled={pending} onClick={onClose}>
              取消
            </button>
            <button
              className="primary"
              disabled={pending || !file || !title.trim()}
            >
              {pending ? "正在提交…" : "提交展示作品"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
