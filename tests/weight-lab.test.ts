import { expect, it } from "vitest";
import {
  WeightSceneSchema,
  WeightDocumentSchema,
  weightDefault,
  weightPaths,
  roundedAreas,
} from "../apps/web/src/features/color-lab/weight-scene";
it("curtain changes leave every other static shape and locked palette unchanged", () => {
  const a = weightDefault(),
    b = { ...a, curtain: 48 };
  const x = weightPaths(a),
    y = weightPaths(b);
  expect(x[1].d).not.toBe(y[1].d);
  expect(x.filter((_, i) => i !== 1)).toEqual(y.filter((_, i) => i !== 1));
  expect(WeightSceneSchema.safeParse({ ...a, curtain: 11 }).success).toBe(
    false,
  );
  expect(
    WeightSceneSchema.safeParse({
      ...a,
      palette: ["#000000", ...a.palette.slice(1)],
    }).success,
  ).toBe(false);
});
it("area rounding totals 100 percent; validated snapshots are independent of live edits", () => {
  const values = roundedAreas([100, 203, 17, 97]);
  expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
  expect(roundedAreas([1, 1, 1, 0])).toEqual([33.4, 33.3, 33.3, 0]);
  const current = weightDefault(),
    snapshot = structuredClone(current);
  current.curtain = 48;
  const restored = WeightDocumentSchema.parse({
    version: 1,
    current,
    saved: [{ id: "a", scene: snapshot }],
  });
  expect(restored.saved[0].scene.curtain).toBe(28);
  expect(restored.current.curtain).toBe(48);
});
