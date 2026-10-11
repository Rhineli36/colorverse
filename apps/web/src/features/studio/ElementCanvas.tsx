import { useEffect, useRef, useState, type PointerEvent } from "react";
import type {
  Layer,
  PlanetDocument,
  SceneDocument,
  Transform,
} from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import { SceneCanvas } from "../../app/SceneCanvas";
export function ElementCanvas({
  assets,
  planet,
  scene,
  layer,
  onCommit,
  disabled,
}: {
  assets: AssetStore;
  planet: PlanetDocument;
  scene: SceneDocument;
  layer: Layer;
  onCommit: (t: Transform) => void;
  disabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    drag = useRef<{
      x: number;
      y: number;
      t: Transform;
      resize: boolean;
    } | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 560 }),
    [preview, setPreview] = useState<Transform | null>(null);
  useEffect(() => {
    const node = host.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: node.clientWidth, height: node.clientHeight }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(size.width / scene.width, size.height / scene.height),
    t = preview ?? layer.transform;
  const stop = (commit: boolean) => {
    if (commit && preview) onCommit(preview);
    drag.current = null;
    setPreview(null);
  };
  const start = (e: PointerEvent<HTMLButtonElement>, resize = false) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      t: { ...layer.transform },
      resize,
    };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / scale,
      dy = (e.clientY - d.y) / scale;
    if (d.resize) {
      const next = Math.max(
        0.1,
        Math.min(2, d.t.scaleX + Math.max(dx, dy) / 200),
      );
      setPreview({ ...d.t, scaleX: next, scaleY: next });
    } else
      setPreview({
        ...d.t,
        x: Math.max(0, Math.min(scene.width, d.t.x + dx)),
        y: Math.max(0, Math.min(scene.height, d.t.y + dy)),
      });
  };
  return (
    <div className="element-canvas" ref={host}>
      <SceneCanvas
        assets={assets}
        planet={planet}
        scene={scene}
        motionPaused={!!preview}
        layerPreview={preview ? { id: layer.id, transform: preview } : null}
        options={{}}
      />
      <div
        className="element-transform"
        style={{
          left: (size.width - scene.width * scale) / 2 + t.x * scale,
          top: (size.height - scene.height * scale) / 2 + t.y * scale,
          width: 200 * t.scaleX * scale,
          height: 200 * t.scaleY * scale,
          transform: `translate(-50%,-50%) rotate(${t.rotationDeg}deg)`,
        }}
      >
        <button
          aria-label="拖动当前元素"
          className="element-drag"
          disabled={disabled}
          onPointerDown={(e) => start(e)}
          onPointerMove={move}
          onPointerUp={() => stop(true)}
          onPointerCancel={() => stop(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              stop(false);
              return;
            }
            const delta = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            }[e.key];
            if (delta) {
              e.preventDefault();
              const step = e.shiftKey ? 10 : 1;
              onCommit({
                ...layer.transform,
                x: Math.max(
                  0,
                  Math.min(scene.width, layer.transform.x + delta[0] * step),
                ),
                y: Math.max(
                  0,
                  Math.min(scene.height, layer.transform.y + delta[1] * step),
                ),
              });
            }
          }}
        />
        <button
          aria-label="缩放当前元素"
          className="element-resize"
          disabled={disabled}
          onPointerDown={(e) => start(e, true)}
          onPointerMove={move}
          onPointerUp={() => stop(true)}
          onPointerCancel={() => stop(false)}
        />
      </div>
    </div>
  );
}
