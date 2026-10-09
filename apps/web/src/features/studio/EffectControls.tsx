import type { Layer } from "@colorverse/contracts";
import { Field, Range } from "./controls";
export function EffectControls({
  layer,
  patch,
}: {
  layer: Layer;
  patch: (fn: (layer: Layer) => void) => void;
}) {
  if (!("effectId" in layer.source)) return null;
  const { effectId, params } = layer.source;
  return (
    <>
      {layer.source.anchorLayerId && (
        <p className="hint">
          已跟随主体：移动、缩放和轻微动画都会一起变化；位置参数用于调整相对偏移。
        </p>
      )}
      <Field label="效果颜色">
        <input
          type="color"
          value={params.color}
          onChange={(e) =>
            patch((l) => {
              if ("effectId" in l.source)
                l.source.params.color = e.target.value;
            })
          }
        />
      </Field>
      {(["intensity", "density", "opacity", "speed"] as const)
        .filter(
          (k) =>
            k !== "density" ||
            [
              "stardust",
              "fireflies",
              "floating-lights",
              "rain",
              "snow",
            ].includes(effectId),
        )
        .map((k) => (
          <Range
            key={k}
            label={
              {
                intensity: "强度",
                density: "密度",
                opacity: "效果透明度",
                speed: "运动速度",
              }[k]
            }
            min={0}
            max={k === "speed" ? 2 : 1}
            value={params[k]}
            onChange={(v) =>
              patch((l) => {
                if ("effectId" in l.source) l.source.params[k] = v;
              })
            }
          />
        ))}
      {effectId === "satellite" && (
        <>
          <Field label="卫星数量">
            <select
              value={params.satelliteCount ?? 1}
              onChange={(e) =>
                patch((l) => {
                  if ("effectId" in l.source)
                    l.source.params.satelliteCount = Number(e.target.value);
                })
              }
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} 颗
                </option>
              ))}
            </select>
          </Field>
          <Range
            label="轨道半径"
            min={100}
            max={600}
            value={params.orbitRadiusPx ?? 340}
            onChange={(v) =>
              patch((l) => {
                if ("effectId" in l.source) l.source.params.orbitRadiusPx = v;
              })
            }
          />
          <Range
            label="卫星大小"
            min={4}
            max={60}
            value={params.satelliteRadiusPx ?? 24}
            onChange={(v) =>
              patch((l) => {
                if ("effectId" in l.source)
                  l.source.params.satelliteRadiusPx = v;
              })
            }
          />
          <Range
            label="轨道倾斜"
            min={0.15}
            max={0.9}
            value={params.orbitTilt ?? 0.5}
            onChange={(v) =>
              patch((l) => {
                if ("effectId" in l.source) l.source.params.orbitTilt = v;
              })
            }
          />
          <p className="hint">卫星会沿椭圆轨道绕行，速度设为 0 可静止。</p>
        </>
      )}
    </>
  );
}
