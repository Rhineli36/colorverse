import { useEffect, useMemo, useState } from "react";
import {
  GrowthPresetIds,
  GrowthPresets,
  type Layer,
  type PlanetDocument,
  type GrowthEvent,
} from "@colorverse/contracts";
import { updateGrowthElement } from "@colorverse/domain";
import type { AssetStore } from "@colorverse/application";
import { GrowthPresetPreview } from "./GrowthPresetPreview";
import { ElementCanvas } from "./ElementCanvas";
import { Field, Range } from "./controls";
export function ElementEditorView({
  assets,
  doc,
  initial,
  onSave,
  onClose,
  onDirty,
}: {
  assets: AssetStore;
  doc: PlanetDocument;
  initial: Layer;
  onSave: (layer: Layer, revision: number) => Promise<void>;
  onClose: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(initial)),
    [history, setHistory] = useState<Layer[]>([]),
    [future, setFuture] = useState<Layer[]>([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const changed = JSON.stringify(initial) !== JSON.stringify(draft);
  useEffect(() => {
    onDirty(changed);
    return () => onDirty(false);
  }, [changed, onDirty]);
  const preview = useMemo(() => updateGrowthElement(doc, draft), [doc, draft]);
  const scene = preview.interior.layers.some((l) => l.id === draft.id)
    ? preview.interior
    : preview.exterior.scene;
  const source = draft.source;
  if (!("presetId" in source) || source.presetId === "sphere") return null;
  const patch = (fn: (l: Layer) => void) => {
    if (pending) return;
    const next = structuredClone(draft);
    fn(next);
    if (JSON.stringify(next) === JSON.stringify(draft)) return;
    setHistory((h) => [...h, draft].slice(-100));
    setFuture([]);
    setDraft(next);
    setError("");
  };
  const params = (fn: (p: GrowthEvent["elements"][number]["params"]) => void) =>
    patch((l) => {
      if ("presetId" in l.source && l.source.presetId !== "sphere")
        fn(l.source.params);
    });
  const animation = draft.animation[0]?.type ?? "none";
  const speed = source.params.motionSpeed;
  const animate = (l: Layer, type: string, rate: number) => {
    l.animation =
      type === "float"
        ? [
            {
              type: "float",
              amplitudePx: 12,
              periodSec: Math.min(60, Math.max(1, 8 / Math.max(0.1, rate))),
            },
          ]
        : type === "rotate"
          ? [{ type: "rotate", degreesPerSec: rate * 10 }]
          : type === "breathe"
            ? [
                {
                  type: "breathe",
                  minOpacity: 0.75,
                  maxOpacity: 1,
                  periodSec: Math.max(1, 4 / Math.max(0.1, rate)),
                },
              ]
            : [];
  };
  return (
    <main className="element-editor" aria-label="元素专用编辑器">
      <header className="element-heading">
        <div>
          <p className="eyebrow">ELEMENT STUDIO</p>
          <h1>编辑「{GrowthPresets[source.presetId].name}」</h1>
          <p>只修改当前元素 · 在画面直接拖动，角点调整大小</p>
        </div>
        <button disabled={pending} onClick={onClose}>
          取消修改并返回
        </button>
      </header>
      <section className="element-library" aria-label="元素造型库">
        <div className="element-library-heading">
          <strong>选择造型</strong>
          <span>8种预制原型 · 持续扩充</span>
        </div>
        <div className="element-library-cards">
          {GrowthPresetIds.map((id) => (
            <button
              key={id}
              disabled={pending}
              aria-label={`选择${GrowthPresets[id].name}`}
              aria-pressed={source.presetId === id}
              onClick={() =>
                patch((l) => {
                  if ("presetId" in l.source && l.source.presetId !== "sphere")
                    l.source.presetId = id;
                })
              }
            >
              <GrowthPresetPreview
                id={id}
                color={source.params.color}
                seed={source.params.seed}
              />
              <span>{GrowthPresets[id].name}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="element-workspace">
        <section className="element-stage" aria-label="元素画面">
          <ElementCanvas
            assets={assets}
            planet={preview}
            scene={scene}
            layer={draft}
            disabled={pending}
            onCommit={(transform) =>
              patch((l) => {
                l.transform = transform;
              })
            }
          />
          <p className="hint">
            拖动元素移动 · 拖角点缩放 · 方向键微调，Shift加快
          </p>
        </section>
        <fieldset disabled={pending} className="element-details">
          <legend>当前元素细节</legend>
          <Field label="元素颜色">
            <input
              type="color"
              value={source.params.color}
              onChange={(e) =>
                params((p) => {
                  p.color = e.target.value;
                })
              }
            />
          </Field>
          <Range
            label="元素饱和度"
            min={0}
            max={2}
            step={0.01}
            value={draft.adjustments.saturation}
            onChange={(n) =>
              patch((l) => {
                l.adjustments.saturation = n;
              })
            }
          />
          <Range
            label="元素大小"
            min={0.1}
            max={2}
            step={0.01}
            value={draft.transform.scaleX}
            onChange={(n) =>
              patch((l) => {
                l.transform.scaleX = l.transform.scaleY = n;
              })
            }
          />
          <Range
            label="元素光晕"
            min={0}
            max={1}
            step={0.01}
            value={source.params.glowIntensity}
            onChange={(n) =>
              params((p) => {
                p.glowIntensity = n;
              })
            }
          />
          <Range
            label="元素透明度"
            min={0.1}
            max={1}
            step={0.01}
            value={draft.opacity}
            onChange={(n) =>
              patch((l) => {
                l.opacity = n;
              })
            }
          />
          <Field label="元素自身动态">
            <select
              value={animation}
              onChange={(e) =>
                patch((l) => {
                  animate(l, e.target.value, speed);
                })
              }
            >
              <option value="none">静止</option>
              <option value="float">轻柔漂浮</option>
              <option value="rotate">缓慢旋转</option>
              <option value="breathe">呼吸光效</option>
            </select>
          </Field>
          <Range
            label="元素动态速度"
            min={0.1}
            max={2}
            step={0.05}
            value={speed || 0.35}
            onChange={(n) =>
              patch((l) => {
                if ("presetId" in l.source && l.source.presetId !== "sphere")
                  l.source.params.motionSpeed = n;
                animate(l, animation, n);
              })
            }
          />
          <Field label="元素粒子效果">
            <select
              value={source.params.particleStyle ?? "none"}
              onChange={(e) =>
                params((p) => {
                  if (e.target.value === "none") delete p.particleStyle;
                  else
                    p.particleStyle = e.target.value as
                      "stardust" | "fireflies";
                })
              }
            >
              <option value="none">无粒子</option>
              <option value="stardust">细小星尘</option>
              <option value="fireflies">萤火光点</option>
            </select>
          </Field>
          <p className="hint">
            动态只作用于这个元素，整颗星球的轨迹在星球编辑器的「运动」页中设置。
          </p>
        </fieldset>
      </div>
      <footer className="element-actions">
        <div>
          <button
            disabled={pending || !history.length}
            onClick={() => {
              setFuture((f) => [...f, draft]);
              setDraft(history.at(-1)!);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            撤销一步
          </button>
          <button
            disabled={pending || !future.length}
            onClick={() => {
              setHistory((h) => [...h, draft]);
              setDraft(future.at(-1)!);
              setFuture((f) => f.slice(0, -1));
            }}
          >
            重做
          </button>
          <button
            disabled={pending || !changed}
            onClick={() => {
              setHistory((h) => [...h, draft]);
              setFuture([]);
              setDraft(structuredClone(initial));
              setError("");
            }}
          >
            重置当前元素
          </button>
        </div>
        <p role="status">
          {pending
            ? "正在保存元素…"
            : changed
              ? "修改尚未保存"
              : "当前元素已保存"}
        </p>
        <button
          className="primary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError("");
            try {
              if (changed) await onSave(draft, doc.revision);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "保存失败，请重试");
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "保存中…" : "确定并返回"}
        </button>
      </footer>
      {error && (
        <p className="element-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
