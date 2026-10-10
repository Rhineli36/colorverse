import type { GrowthPresetId } from "@colorverse/contracts";
import { growthShapes, growthPaint } from "@colorverse/domain";
export function GrowthPresetPreview({
  id,
  color,
  seed = 42,
}: {
  id: GrowthPresetId;
  color: string;
  seed?: number;
}) {
  const paint = growthPaint(color);
  return (
    <svg viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
      <circle r="84" fill={color} opacity=".07" />
      {growthShapes(id, seed).map((shape, i) => {
        const style = {
          fill: shape.fill ? paint[shape.fill] : "none",
          fillOpacity: shape.alpha ?? 1,
          stroke: shape.stroke ? paint[shape.stroke] : undefined,
          strokeWidth: shape.width ?? 2,
          strokeOpacity: shape.kind === "line" ? (shape.alpha ?? 0.5) : 0.5,
        };
        if (shape.kind === "circle")
          return (
            <circle
              key={i}
              cx={shape.x}
              cy={shape.y}
              r={shape.radius}
              {...style}
            />
          );
        if (shape.kind === "ellipse")
          return (
            <ellipse
              key={i}
              cx={shape.x}
              cy={shape.y}
              rx={shape.rx}
              ry={shape.ry}
              {...style}
            />
          );
        const points = shape.points.reduce(
          (s, value, k) => s + (k % 2 ? `${value} ` : `${value},`),
          "",
        );
        return shape.kind === "poly" ? (
          <polygon key={i} points={points} {...style} />
        ) : (
          <polyline key={i} points={points} {...style} />
        );
      })}
    </svg>
  );
}
