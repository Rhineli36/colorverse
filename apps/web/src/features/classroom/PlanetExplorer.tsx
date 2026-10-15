import { useEffect, useRef, useState, type ReactNode } from "react";
import "./exploration.css";
type View = { zoom: number; x: number; y: number };
const initial: View = { zoom: 1, x: 0, y: 0 };
export function PlanetExplorer({
  sceneId,
  children,
  disabled = false,
  fixed = true,
}: {
  sceneId: string;
  children: ReactNode;
  disabled?: boolean;
  fixed?: boolean;
}) {
  const views = useRef(new Map<string, View>()),
    [view, setView] = useState<View>(initial),
    box = useRef<HTMLDivElement>(null),
    current = useRef(view),
    drag = useRef<{ x: number; y: number; view: View } | null>(null);
  current.current = view;
  useEffect(() => {
    setView(views.current.get(sceneId) ?? initial);
  }, [sceneId]);
  const update = (next: View) => {
    const zoom = Math.max(1, Math.min(2.5, next.zoom)),
      bound = (zoom - 1) / 2,
      v = {
        zoom,
        x: Math.max(-bound, Math.min(bound, next.x)),
        y: Math.max(-bound, Math.min(bound, next.y)),
      };
    views.current.set(sceneId, v);
    setView(v);
  };
  const zoom = (factor: number, x = 0, y = 0) => {
    const old = current.current,
      z = Math.max(1, Math.min(2.5, old.zoom * factor)),
      ratio = z / old.zoom;
    update({ zoom: z, x: x + (old.x - x) * ratio, y: y + (old.y - y) * ratio });
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (disabled || fixed) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(
        Math.exp(-e.deltaY * 0.0015),
        (e.clientX - r.left) / r.width - 0.5,
        (e.clientY - r.top) / r.height - 0.5,
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [sceneId, disabled, fixed]);
  return (
    <section
      className={`planet-explorer ${fixed ? "fixed-scene" : ""}`}
      aria-label="星球探索场景"
    >
      <div className="explorer-controls">
        <span>点击微光，发现作品</span>
        {!fixed && (
          <div>
            <button
              type="button"
              aria-label="放大场景"
              disabled={disabled || view.zoom >= 2.5}
              onClick={() => zoom(1.2)}
            >
              ＋
            </button>
            <output>{Math.round(view.zoom * 100)}%</output>
            <button
              type="button"
              aria-label="缩小场景"
              disabled={disabled || view.zoom <= 1}
              onClick={() => zoom(1 / 1.2)}
            >
              −
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => update(initial)}
            >
              还原视野
            </button>
          </div>
        )}
      </div>
      <div
        className="explorer-viewport"
        ref={box}
        tabIndex={0}
        aria-label={fixed ? "固定视野的星球场景" : "可拖动缩放的星球场景"}
        data-zoom={view.zoom.toFixed(3)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || disabled || fixed) return;
          const d = {
            ArrowLeft: [0.04, 0],
            ArrowRight: [-0.04, 0],
            ArrowUp: [0, 0.04],
            ArrowDown: [0, -0.04],
          }[e.key];
          if (d) {
            e.preventDefault();
            update({ ...view, x: view.x + d[0], y: view.y + d[1] });
          } else if (e.key === "+" || e.key === "=") zoom(1.2);
          else if (e.key === "-") zoom(1 / 1.2);
          else if (e.key === "Home") update(initial);
        }}
        onPointerDown={(e) => {
          if (disabled || fixed || (e.target as HTMLElement).closest("button"))
            return;
          drag.current = { x: e.clientX, y: e.clientY, view };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const r = e.currentTarget.getBoundingClientRect(),
            d = drag.current;
          update({
            ...d.view,
            x: d.view.x + (e.clientX - d.x) / r.width,
            y: d.view.y + (e.clientY - d.y) / r.height,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="explorer-world"
          style={{
            transform: `translate(${view.x * 100}%,${view.y * 100}%) scale(${view.zoom})`,
          }}
        >
          {children}
        </div>
      </div>
      <small className="explorer-hint">
        {fixed
          ? "滚轮上下浏览 · 点击元素欣赏作品 · 右侧目录可定位微光"
          : "滚轮缩放 · 放大后拖动空白探索 · 回车查看元素"}
      </small>
    </section>
  );
}
