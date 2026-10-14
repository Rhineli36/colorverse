import { describe, expect, it } from "vitest";
import {
  CloudPlanetDocumentSchema,
  CloudPlanetAppearanceInput,
  DefaultCloudMotion,
  MotionSchema,
} from "@colorverse/contracts";
import {
  cloudUniverseLayout,
  orbitPath,
  orbitPosition,
} from "@colorverse/domain";

describe("shared classroom motion", () => {
  it("keeps existing cloud planets stationary and rejects free-form motion", () => {
    expect(
      CloudPlanetDocumentSchema.parse({ metadata: { name: "old" } }).motion,
    ).toEqual(DefaultCloudMotion);
    for (const patch of [
      { mode: "warp" },
      { trajectory: "custom" },
      { periodSec: 1 },
      { range: "unlimited" },
    ])
      expect(
        CloudPlanetAppearanceInput.safeParse({
          name: "星球",
          color: "#abcdef",
          motion: { ...DefaultCloudMotion, ...patch },
        }).success,
      ).toBe(false);
    expect(
      MotionSchema.parse({ ...DefaultCloudMotion, mode: "fast" }).mode,
    ).toBe("fast");
  });
  it("arranges empty and reordered class responses deterministically without editing input", () => {
    expect(cloudUniverseLayout([])).toEqual({
      width: 1000,
      height: 1000,
      entries: [],
    });
    const input = [
        { id: "b", motion: DefaultCloudMotion },
        { id: "a", motion: DefaultCloudMotion },
      ],
      previous = structuredClone(input);
    expect(cloudUniverseLayout(input)).toEqual(
      cloudUniverseLayout([...input].reverse()),
    );
    expect(input).toEqual(previous);
  });
  it("fits complete paths and halos inside a six/forty planet map", () => {
    for (const count of [6, 40]) {
      const data = Array.from({ length: count }, (_, i) => ({
        id: `planet-${i}`,
        motion: {
          ...DefaultCloudMotion,
          mode: "fast" as const,
          trajectory: (["circle", "ellipse", "figure-eight", "drift"] as const)[
            i % 4
          ],
          range: "wide" as const,
        },
      }));
      const map = cloudUniverseLayout(data);
      for (const entry of map.entries) {
        expect(orbitPosition(entry.orbit, 0).x).toBeCloseTo(entry.anchor.x);
        expect(orbitPosition(entry.orbit, 0).y).toBeCloseTo(entry.anchor.y);
        for (const point of orbitPath(entry.orbit)) {
          expect(point.x).toBeGreaterThanOrEqual(150);
          expect(point.y).toBeGreaterThanOrEqual(150);
          expect(point.x).toBeLessThanOrEqual(map.width - 150);
          expect(point.y).toBeLessThanOrEqual(map.height - 150);
        }
      }
    }
  });
});
