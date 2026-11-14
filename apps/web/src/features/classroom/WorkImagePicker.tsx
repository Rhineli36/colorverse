import { useEffect, useId, useRef, useState } from "react";
import { imageInfo } from "@colorverse/package-io";
import {
  imagePixelHint,
  imageUploadLimitBytes,
  imageUploadLimitMb,
  validateWorkImages,
} from "./cloud-image-upload";
import "./work-image-picker.css";

async function thumbnail(file: File) {
  const canvas = document.createElement("canvas");
  let bitmap: ImageBitmap | undefined;
  let image: HTMLImageElement | undefined;
  let sourceUrl: string | undefined;
  try {
    if (typeof createImageBitmap === "function") {
      try {
        const info = imageInfo(new Uint8Array(await file.arrayBuffer()));
        bitmap = await createImageBitmap(file, {
          resizeWidth: Math.min(320, info.width),
          resizeQuality: "low",
        });
      } catch {
        // Older Safari versions may not support bitmap resize options.
      }
    }
    if (!bitmap) {
      sourceUrl = URL.createObjectURL(file);
      image = new Image();
      await new Promise<void>((resolve, reject) => {
        image!.onload = () => resolve();
        image!.onerror = () => reject(Error("PREVIEW_UNAVAILABLE"));
        image!.src = sourceUrl!;
      });
    }
    const source = bitmap ?? image!;
    const width = bitmap?.width ?? image!.naturalWidth;
    const height = bitmap?.height ?? image!.naturalHeight;
    const scale = Math.min(1, 320 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("PREVIEW_UNAVAILABLE");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(Error("PREVIEW_UNAVAILABLE")),
        "image/webp",
        0.75,
      ),
    );
    return URL.createObjectURL(blob);
  } finally {
    bitmap?.close();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (image) image.src = "";
    canvas.width = canvas.height = 0;
  }
}

export function WorkImagePicker({
  files,
  onChange,
  disabled = false,
  onCheckingChange,
  existingCount = 0,
  label = "作品图片",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  onCheckingChange: (checking: boolean) => void;
  existingCount?: number;
  label?: string;
}) {
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Map<File, string>>(new Map());
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    setPreviews(new Map());
    // Generate small previews sequentially; never retain six full-size bitmaps.
    void (async () => {
      for (const file of files) {
        if (!active) break;
        try {
          const url = await thumbnail(file);
          urls.push(url);
          if (active) setPreviews((old) => new Map(old).set(file, url));
          else URL.revokeObjectURL(url);
        } catch {
          // A local preview failure must not discard a selected original.
        }
      }
    })();
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);
  const count = existingCount + files.length;
  return (
    <section className="work-image-picker" aria-label="作品图片列表">
      <label>
        {label}
        <input
          ref={input}
          className="work-image-input"
          aria-label={label}
          aria-describedby={hintId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          aria-required={count === 0}
          disabled={disabled || checking || count >= 6}
          onChange={async (event) => {
            const picked = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (!picked.length) return;
            setChecking(true);
            onCheckingChange(true);
            setError("");
            try {
              const next = [...files, ...picked];
              if (existingCount + next.length > 6)
                throw Error("每次最多提交六张作品图片，请先移除不需要的图片。");
              await validateWorkImages(next);
              onChange(next);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "图片读取失败，请重新选择。",
              );
            } finally {
              setChecking(false);
              onCheckingChange(false);
            }
          }}
        />
      </label>
      <button
        className="work-image-add"
        type="button"
        disabled={disabled || checking || count >= 6}
        onClick={() => input.current?.click()}
      >
        {count >= 6
          ? "已达到6张上限"
          : files.length
            ? "＋ 继续添加图片"
            : "＋ 添加作品图片"}
      </button>
      <p id={hintId} className="muted">
        可分次添加，也可多选；添加后可逐张移除，最后统一提交。 支持
        PNG、JPG（JPEG）、WebP，最多6张，合计最多 {imageUploadLimitMb} MB，
        {imagePixelHint}。HEIC、TIFF 请先导出为上述格式。
      </p>
      <p className="work-image-count" role="status">
        {checking ? "正在检查图片…" : `已选 ${count} / 6 张`}
        {files.length > 0 &&
          ` · ${existingCount ? "新增图片" : "合计"} ${((files.reduce((n, f) => n + f.size, 0) / imageUploadLimitBytes) * imageUploadLimitMb).toFixed(2)} MB`}
      </p>
      {error && (
        <p className="work-image-error" role="alert">
          {error} 已选图片保持不变。
        </p>
      )}
      <div className="work-image-grid">
        {files.map((file, index) => (
          <figure key={index} className="work-image-card">
            {previews.get(file) ? (
              <img src={previews.get(file)} alt={`作品图片预览 ${index + 1}`} />
            ) : (
              <div className="work-image-placeholder">图片 {index + 1}</div>
            )}
            <figcaption>
              <span title={file.name}>
                {index + 1}. {file.name}
              </span>
              <button
                type="button"
                disabled={disabled || checking}
                aria-label={`移除作品图片 ${index + 1}`}
                onClick={() => {
                  setError("");
                  onChange(files.filter((_, i) => i !== index));
                }}
              >
                移除
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
