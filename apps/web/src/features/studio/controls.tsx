import { cloneElement, isValidElement, type ReactNode } from "react";
import { useEditor } from "./editor-store";
export const effectNames: Record<string, string> = {
  stardust: "星尘",
  fireflies: "萤火虫",
  "floating-lights": "漂浮光点",
  rain: "雨",
  snow: "雪",
  fog: "雾气",
  "outer-glow": "外发光",
  "soft-glow": "柔光",
  "light-beam": "光束",
  breathe: "呼吸光效",
  ring: "星环",
  halo: "光晕",
  "rim-light": "边缘光",
  satellite: "卫星",
};
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const control =
    isValidElement<{ "aria-label"?: string }>(children) &&
    typeof children.type === "string" &&
    ["input", "textarea", "select"].includes(children.type)
      ? cloneElement(children, {
          "aria-label": children.props["aria-label"] ?? label,
        })
      : children;
  return (
    <label className="field">
      <span>{label}</span>
      {control}
    </label>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="range">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={() => useEditor.getState().begin()}
          onPointerUp={() => useEditor.getState().end()}
          onKeyDown={() => useEditor.getState().begin()}
          onKeyUp={() => useEditor.getState().end()}
          onBlur={() => useEditor.getState().end()}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output>{Number(value.toFixed(2))}</output>
      </div>
    </Field>
  );
}
