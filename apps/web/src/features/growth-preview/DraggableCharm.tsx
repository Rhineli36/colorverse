import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type CharmAmplitude = "still" | "gentle" | "expressive";
export type CharmPlacement = {
  x: number;
  y: number;
  amplitude: CharmAmplitude;
};
export const initialCharmPlacement: CharmPlacement = {
  x: 0.85,
  y: 0.35,
  amplitude: "gentle",
};

export function DraggableCharm({
  placement,
  onChange,
  children,
  name,
}: {
  placement: CharmPlacement;
  onChange: (next: CharmPlacement) => void;
  children: ReactNode;
  name: string;
}) {
  const host = useRef<HTMLButtonElement>(null);
  const [point, setPoint] = useState({ x: placement.x, y: placement.y });
  const pointRef = useRef(point);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null>(null);
  const bounded = (p: { x: number; y: number }) => {
    const el = host.current,
      scene = el?.parentElement;
    if (!el || !scene) return p;
    const margin = placement.amplitude === "expressive" ? 24 : 14;
    const mx = Math.min(
        0.5,
        (el.offsetWidth / 2 + margin) / Math.max(1, scene.clientWidth),
      ),
      my = Math.min(
        0.5,
        (el.offsetHeight / 2 + margin) / Math.max(1, scene.clientHeight),
      );
    return {
      x: Math.max(mx, Math.min(1 - mx, p.x)),
      y: Math.max(my, Math.min(1 - my, p.y)),
    };
  };
  const update = (p: { x: number; y: number }) => {
    const next = bounded(p);
    pointRef.current = next;
    setPoint(next);
    return next;
  };
  useEffect(() => {
    if (!drag.current) update({ x: placement.x, y: placement.y });
  }, [placement.x, placement.y, placement.amplitude]);
  useEffect(() => {
    const el = host.current;
    if (!el?.parentElement) return;
    const observer = new ResizeObserver(() => {
      const next = bounded(pointRef.current);
      if (
        Math.abs(next.x - pointRef.current.x) > 1e-6 ||
        Math.abs(next.y - pointRef.current.y) > 1e-6
      ) {
        pointRef.current = next;
        setPoint(next);
      }
    });
    observer.observe(el);
    observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, [placement.amplitude]);
  const finish = (cancel = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragging(false);
    if (cancel) update({ x: current.x, y: current.y });
    else onChange({ ...placement, ...pointRef.current });
    if (host.current?.hasPointerCapture(current.id))
      host.current.releasePointerCapture(current.id);
  };
  return (
    <button
      ref={host}
      className={`gp-draggable-charm ${dragging ? "is-dragging" : ""}`}
      aria-label={`拖动${name}`}
      title="拖动调整位置；方向键微调；Home 复位"
      data-amplitude={placement.amplitude}
      data-x={point.x.toFixed(4)}
      data-y={point.y.toFixed(4)}
      style={
        {
          left: `${point.x * 100}%`,
          top: `${point.y * 100}%`,
          "--charm-travel":
            placement.amplitude === "expressive" ? "12px" : "4px",
          "--charm-angle":
            placement.amplitude === "expressive" ? "4.5deg" : "1.5deg",
        } as CSSProperties
      }
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.focus({ preventScroll: true });
        drag.current = {
          id: e.pointerId,
          clientX: e.clientX,
          clientY: e.clientY,
          ...pointRef.current,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start || start.id !== e.pointerId) return;
        const r = e.currentTarget.parentElement!.getBoundingClientRect();
        update({
          x: start.x + (e.clientX - start.clientX) / r.width,
          y: start.y + (e.clientY - start.clientY) / r.height,
        });
      }}
      onPointerUp={() => finish()}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => finish()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && drag.current) {
          e.preventDefault();
          finish(true);
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
          const step = e.shiftKey ? 0.04 : 0.01;
          const next = update({
            x: pointRef.current.x + delta[0] * step,
            y: pointRef.current.y + delta[1] * step,
          });
          onChange({ ...placement, ...next });
        }
        if (e.key === "Home") {
          e.preventDefault();
          const next = update(initialCharmPlacement);
          onChange({ ...placement, ...next });
        }
      }}
    >
      <span className="gp-float-motion">{children}</span>
    </button>
  );
}

export function CharmPositionControls({
  placement,
  onChange,
  disabled = false,
  name,
}: {
  placement: CharmPlacement;
  onChange: (next: CharmPlacement) => void;
  disabled?: boolean;
  name: string;
}) {
  return (
    <section
      className="gp-charm-position-controls"
      aria-label="浮饰位置与运动设置"
    >
      <div>
        <strong>{name}</strong>
        <span>直接拖动摆放 · 方向键微调</span>
      </div>
      <fieldset disabled={disabled}>
        <legend>浮动幅度</legend>
        {(
          [
            { id: "still", label: "静止" },
            { id: "gentle", label: "轻柔" },
            { id: "expressive", label: "明显" },
          ] as const
        ).map((a) => (
          <label key={a.id}>
            <input
              type="radio"
              name="charm-amplitude"
              value={a.id}
              checked={placement.amplitude === a.id}
              onChange={() => onChange({ ...placement, amplitude: a.id })}
            />
            {a.label}
          </label>
        ))}
      </fieldset>
      <button
        disabled={disabled}
        onClick={() =>
          onChange({
            ...placement,
            x: initialCharmPlacement.x,
            y: initialCharmPlacement.y,
          })
        }
      >
        复位位置
      </button>
    </section>
  );
}
