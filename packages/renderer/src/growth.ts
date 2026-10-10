import { Graphics } from "pixi.js";
import { growthShapes, growthPaint } from "@colorverse/domain";
import type { GrowthPresetId } from "@colorverse/contracts";
export function drawGrowth(id: GrowthPresetId, color: string, seed: number) {
  const graphics = new Graphics(),
    paint = growthPaint(color);
  for (const shape of growthShapes(id, seed)) {
    if (shape.kind === "circle")
      graphics.circle(shape.x, shape.y, shape.radius);
    else if (shape.kind === "ellipse")
      graphics.ellipse(shape.x, shape.y, shape.rx, shape.ry);
    else if (shape.kind === "poly") graphics.poly(shape.points);
    else {
      graphics.moveTo(shape.points[0], shape.points[1]);
      for (let i = 2; i < shape.points.length; i += 2)
        graphics.lineTo(shape.points[i], shape.points[i + 1]);
    }
    if (shape.fill)
      graphics.fill({ color: paint[shape.fill], alpha: shape.alpha ?? 1 });
    if (shape.stroke)
      graphics.stroke({
        color: paint[shape.stroke],
        width: shape.width ?? 2,
        alpha: shape.kind === "line" ? (shape.alpha ?? 0.5) : 0.5,
      });
  }
  return graphics;
}
