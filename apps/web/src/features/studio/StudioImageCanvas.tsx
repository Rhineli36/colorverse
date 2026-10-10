import { useEffect, useRef, useState, type PointerEvent } from "react";
import type {
  AssetRecord,
  Layer,
  PlanetDocument,
  SceneDocument,
  Transform,
} from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import type { RendererOptions } from "@colorverse/renderer";
import { imageBounds, resizeImage, planetFrame } from "@colorverse/domain";
import { SceneCanvas } from "../../app/SceneCanvas";
export function StudioImageCanvas({
  assets,
  planet,
  scene,
  selected,
  record,
  locked,
  disabled,
  onCommit,
  options,
  exterior,
}: {
  assets: AssetStore;
  planet: PlanetDocument;
  scene: SceneDocument;
  selected: Layer | null;
  record?: AssetRecord;
  locked: boolean;
  disabled: boolean;
  onCommit: (t: Transform) => void;
  options: RendererOptions;
  exterior: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    drag = useRef<{
      x: number;
      y: number;
      transform: Transform;
      kind: "move" | "x" | "y" | "both";
    } | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 560 }),
    [draft, setDraft] = useState<Transform | null>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let active = true;
    const obs = new ResizeObserver(() => {
      if (!active) return;
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    });
    obs.observe(element);
    return () => {
      active = false;
      obs.disconnect();
    };
  }, []);
  useEffect(() => {
    setDraft(null);
    drag.current = null;
  }, [selected?.id, scene.id]);
  const body =
    exterior &&
    scene.layers.find((l) => l.kind === "image")?.id === selected?.id;
  const bounds =
    selected && record
      ? imageBounds(
          selected,
          record.original.width!,
          body ? record.original.width! : record.original.height!,
        )
      : null;
  if (body && bounds && selected) {
    bounds.left = -selected.transform.anchorX * record!.original.width!;
    bounds.top = -selected.transform.anchorY * record!.original.width!;
    bounds.width = bounds.height = record!.original.width!;
  }
  const scale = Math.min(size.width / scene.width, size.height / scene.height);
  const frame = planetFrame(scene);
  const t = draft ?? selected?.transform;
  const enabled =
    selected?.kind === "image" &&
    selected.visible &&
    record &&
    bounds &&
    t &&
    !disabled;
  const finish = (commit: boolean) => {
    if (commit && draft) onCommit(draft);
    setDraft(null);
    drag.current = null;
  };
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(null);
        drag.current = null;
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const start = (
    e: PointerEvent<HTMLButtonElement>,
    kind: "move" | "x" | "y" | "both",
  ) => {
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      transform: { ...selected.transform },
      kind,
    };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || !bounds) return;
    const dx = (e.clientX - d.x) / scale,
      dy = (e.clientY - d.y) / scale;
    setDraft(
      d.kind === "move"
        ? {
            ...d.transform,
            x: Math.max(-16000, Math.min(16000, d.transform.x + dx)),
            y: Math.max(-16000, Math.min(16000, d.transform.y + dy)),
          }
        : resizeImage(
            d.transform,
            bounds,
            dx,
            dy,
            d.kind,
            locked || e.shiftKey,
          ),
    );
  };
  return (
    <div className="editor-canvas" ref={host}>
      <SceneCanvas
        assets={assets}
        planet={planet}
        scene={scene}
        motionPaused={!!enabled}
        layerPreview={
          draft && selected ? { id: selected.id, transform: draft } : null
        }
        options={options}
      />
      {exterior && (
        <div
          className="planet-mask-guide"
          aria-label="固定星球蒙版"
          style={{
            left: (size.width - scene.width * scale) / 2 + frame.x * scale,
            top: (size.height - scene.height * scale) / 2 + frame.y * scale,
            width: frame.diameter * scale,
            height: frame.diameter * scale,
          }}
        />
      )}
      {enabled && (
        <div
          className="image-transform-overlay"
          style={{
            left: (size.width - scene.width * scale) / 2 + t.x * scale,
            top: (size.height - scene.height * scale) / 2 + t.y * scale,
            transform: `rotate(${t.rotationDeg}deg)`,
          }}
        >
          <div
            className="image-transform-box"
            style={{
              left: bounds.left * t.scaleX * scale,
              top: bounds.top * t.scaleY * scale,
              width: bounds.width * t.scaleX * scale,
              height: bounds.height * t.scaleY * scale,
            }}
          >
            <button
              className="image-move-zone"
              aria-label="拖动选中图片"
              onPointerDown={(e) => start(e, "move")}
              onPointerMove={move}
              onPointerUp={() => finish(true)}
              onPointerCancel={() => finish(false)}
            />
            {(["x", "y", "both"] as const).map((kind, i) => (
              <button
                key={kind}
                className={`image-resize-handle handle-${kind}`}
                aria-label={["拉伸图片宽度", "拉伸图片高度", "缩放图片角点"][i]}
                onPointerDown={(e) => start(e, kind)}
                onPointerMove={move}
                onPointerUp={() => finish(true)}
                onPointerCancel={() => finish(false)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
