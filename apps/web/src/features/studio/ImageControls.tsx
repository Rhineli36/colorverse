import { useEffect, useRef, useState } from "react";
import type {
  AssetRecord,
  ImageCrop,
  Layer,
  PlanetDocument,
} from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import { fullImageCrop, scaleImage } from "@colorverse/domain";
import { Field, Range } from "./controls";
export function ImageControls({
  layer,
  record,
  assets,
  layerPatch,
  patch,
  sceneKind,
  locked,
  setLocked,
  onCropEditing,
}: {
  layer: Layer;
  record: AssetRecord;
  assets: AssetStore;
  layerPatch: (fn: (l: Layer) => void) => void;
  patch: (fn: (p: PlanetDocument) => void) => void;
  sceneKind: "exterior" | "interior";
  locked: boolean;
  setLocked: (v: boolean) => void;
  onCropEditing: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<ImageCrop | null>(null),
    [url, setUrl] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setDraft(null);
    onCropEditing(false);
  }, [layer.id, onCropEditing]);
  useEffect(() => {
    let cancelled = false,
      source = "";
    void assets.resolve(record, "display").then((blob) => {
      if (cancelled) return;
      source = URL.createObjectURL(blob);
      setUrl(source);
    });
    return () => {
      cancelled = true;
      if (source) URL.revokeObjectURL(source);
    };
  }, [assets, record.assetId]);
  const crop = "assetId" in layer.source ? layer.source.crop : undefined;
  const commit = (value: ImageCrop | undefined) =>
    patch((p) => {
      const scene = sceneKind === "exterior" ? p.exterior.scene : p.interior;
      const l = scene.layers.find((l) => l.id === layer.id);
      if (!l || !("assetId" in l.source)) return;
      if (value) l.source.crop = value;
      else delete l.source.crop;
      const hasCrop = [p.exterior.scene, p.interior].some((s) =>
        s.layers.some((l) => "assetId" in l.source && l.source.crop),
      );
      if (hasCrop && !p.requiredCapabilities.includes("image-crop@1"))
        p.requiredCapabilities.push("image-crop@1");
      if (!hasCrop)
        p.requiredCapabilities = p.requiredCapabilities.filter(
          (c) => c !== "image-crop@1",
        );
    });
  const preset = (aspect: number) => {
    const w = record.original.width!,
      h = record.original.height!;
    const cw = Math.min(1, (h * aspect) / w),
      ch = Math.min(1, w / (h * aspect));
    setDraft({ x: (1 - cw) / 2, y: (1 - ch) / 2, width: cw, height: ch });
  };
  return (
    <section className="image-tools" aria-label="图片尺寸与裁剪">
      <div className="panel-title">图片尺寸与裁剪</div>
      <label className="image-lock">
        <input
          type="checkbox"
          aria-label="锁定图片比例"
          checked={locked}
          onChange={(e) => setLocked(e.target.checked)}
        />
        锁定比例
      </label>
      <Range
        label="水平缩放"
        min={0.01}
        max={10}
        value={layer.transform.scaleX}
        onChange={(v) =>
          layerPatch((l) => {
            if (locked)
              l.transform = scaleImage(l.transform, v / l.transform.scaleX);
            else l.transform.scaleX = v;
          })
        }
      />
      <Range
        label="垂直缩放"
        min={0.01}
        max={10}
        value={layer.transform.scaleY}
        onChange={(v) =>
          layerPatch((l) => {
            if (locked)
              l.transform = scaleImage(l.transform, v / l.transform.scaleY);
            else l.transform.scaleY = v;
          })
        }
      />
      <p className="image-hint">
        {sceneKind === "exterior"
          ? "蒙版固定，移动或缩放图片调整圆形取景。"
          : "内部图片保留原有形状。"}
        拖动画布中的选框移动图片，拖动边缘拉伸或角点缩放。
      </p>
      <div className="row-buttons">
        <button
          onClick={() => {
            setDraft(crop ?? fullImageCrop());
            onCropEditing(true);
          }}
        >
          裁剪图片
        </button>
        <button disabled={!crop} onClick={() => commit(undefined)}>
          恢复完整取景
        </button>
      </div>
      {draft && (
        <div className="crop-editor" aria-label="图片裁剪编辑">
          <p className="image-hint">
            拖动预览选取范围，或调整下方百分比。原文件完整保留。
          </p>
          <div
            className="crop-preview"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              start.current = {
                x: Math.max(0, Math.min(0.99, (e.clientX - r.left) / r.width)),
                y: Math.max(0, Math.min(0.99, (e.clientY - r.top) / r.height)),
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!start.current) return;
              const r = e.currentTarget.getBoundingClientRect();
              const x = Math.max(
                  0,
                  Math.min(1, (e.clientX - r.left) / r.width),
                ),
                y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
              const left = Math.min(start.current.x, x, 0.99),
                top = Math.min(start.current.y, y, 0.99);
              setDraft({
                x: left,
                y: top,
                width: Math.min(
                  1 - left,
                  Math.max(0.01, Math.abs(x - start.current.x)),
                ),
                height: Math.min(
                  1 - top,
                  Math.max(0.01, Math.abs(y - start.current.y)),
                ),
              });
            }}
            onPointerUp={() => {
              start.current = null;
            }}
            onPointerCancel={() => {
              start.current = null;
            }}
          >
            {url && <img src={url} alt="原始图片裁剪预览" draggable={false} />}
            <div
              className="crop-selection"
              style={{
                left: `${draft.x * 100}%`,
                top: `${draft.y * 100}%`,
                width: `${draft.width * 100}%`,
                height: `${draft.height * 100}%`,
              }}
            />
          </div>
          <div className="crop-presets">
            {[1, 4 / 3, 16 / 9].map((v, i) => (
              <button key={i} onClick={() => preset(v)}>
                {["正方形", "4:3", "16:9"][i]}
              </button>
            ))}
          </div>
          <Field label="裁剪左边距 (%)">
            <input
              type="number"
              min={0}
              max={99}
              value={Math.round(draft.x * 10000) / 100}
              onChange={(e) => {
                const x = Math.max(
                  0,
                  Math.min(0.99, Number(e.target.value) / 100),
                );
                setDraft({ ...draft, x, width: Math.min(draft.width, 1 - x) });
              }}
            />
          </Field>
          <Field label="裁剪上边距 (%)">
            <input
              type="number"
              min={0}
              max={99}
              value={Math.round(draft.y * 10000) / 100}
              onChange={(e) => {
                const y = Math.max(
                  0,
                  Math.min(0.99, Number(e.target.value) / 100),
                );
                setDraft({
                  ...draft,
                  y,
                  height: Math.min(draft.height, 1 - y),
                });
              }}
            />
          </Field>
          <Field label="裁剪宽度 (%)">
            <input
              type="number"
              min={1}
              max={(1 - draft.x) * 100}
              value={Math.round(draft.width * 10000) / 100}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  width: Math.max(
                    0.01,
                    Math.min(1 - draft.x, Number(e.target.value) / 100),
                  ),
                })
              }
            />
          </Field>
          <Field label="裁剪高度 (%)">
            <input
              type="number"
              min={1}
              max={(1 - draft.y) * 100}
              value={Math.round(draft.height * 10000) / 100}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  height: Math.max(
                    0.01,
                    Math.min(1 - draft.y, Number(e.target.value) / 100),
                  ),
                })
              }
            />
          </Field>
          <div className="row-buttons">
            <button
              className="primary small"
              onClick={() => {
                commit(draft);
                setDraft(null);
                onCropEditing(false);
              }}
            >
              应用裁剪
            </button>
            <button
              onClick={() => {
                setDraft(null);
                onCropEditing(false);
              }}
            >
              取消裁剪
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
