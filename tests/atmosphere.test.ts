import { describe, expect, it } from "vitest";
import {
  ATMOSPHERE_BUDGET,
  meteorFrame,
  meteorStart,
  ambientStarPosition,
  nebulaNoise,
  UNIVERSE_LANDMARKS,
  UNIVERSE_PANORAMA,
  landmarkDustCount,
} from "../packages/renderer/src/atmosphere-model";

describe("universe atmosphere budgets and scheduling", () => {
  it("spreads large landmarks inside the panorama without overlapping bodies", () => {
    expect(new Set(UNIVERSE_LANDMARKS.map((item) => item.id)).size).toBe(
      UNIVERSE_LANDMARKS.length,
    );
    for (const item of UNIVERSE_LANDMARKS) {
      expect(
        Math.abs(item.x - UNIVERSE_PANORAMA.centerX) + item.radius * 4,
      ).toBeLessThan(UNIVERSE_PANORAMA.width / 2);
      expect(
        Math.abs(item.y - UNIVERSE_PANORAMA.centerY) + item.radius * 4,
      ).toBeLessThan(UNIVERSE_PANORAMA.height / 2);
      if (item.kind === "star") expect(item.radius).toBeGreaterThanOrEqual(400);
      for (const other of UNIVERSE_LANDMARKS) {
        if (other.id === item.id) continue;
        expect(Math.hypot(item.x - other.x, item.y - other.y)).toBeGreaterThan(
          (item.radius + other.radius) * 2,
        );
      }
    }
    expect(UNIVERSE_LANDMARKS.some((item) => item.x < -10000)).toBe(true);
    expect(UNIVERSE_LANDMARKS.some((item) => item.x > 10000)).toBe(true);
  });
  it("shares the original total dust budget across every black hole", () => {
    const count = UNIVERSE_LANDMARKS.filter(
      (item) => item.kind === "black-hole",
    ).length;
    for (const { dust } of Object.values(ATMOSPHERE_BUDGET)) {
      const allocations = Array.from({ length: count }, (_, i) =>
        landmarkDustCount(dust, i, count),
      );
      expect(allocations.reduce((sum, n) => sum + n, 0)).toBe(dust);
      expect(Math.min(...allocations)).toBeGreaterThan(0);
      expect(
        Math.max(...allocations) - Math.min(...allocations),
      ).toBeLessThanOrEqual(1);
    }
  });
  it("produces repeatable continuous bounded cloud noise", () => {
    for (let x = -3; x < 10; x += 0.23) {
      const value = nebulaNoise(x, x * 0.7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(nebulaNoise(x, x * 0.7)).toBe(value);
      expect(Math.abs(nebulaNoise(x + 1e-5, x * 0.7) - value)).toBeLessThan(
        0.0001,
      );
    }
  });
  it("schedules one short meteor at random intervals of 90 to 120 seconds", () => {
    expect(meteorFrame(0)).toBeNull();
    expect(meteorFrame(5)).toBeNull();
    expect(meteorFrame(89.99)).toBeNull();
    const intervals = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const start = meteorStart(i),
        previous = i ? meteorStart(i - 1) : 0;
      expect(start - previous).toBeGreaterThanOrEqual(90);
      expect(start - previous).toBeLessThanOrEqual(120);
      intervals.add(Math.round(start - previous));
      expect(meteorFrame(start - 0.001)).toBeNull();
      expect(meteorFrame(start)?.alpha).toBe(0);
      expect(meteorFrame(start + 1.651)).toBeNull();
      const f = meteorFrame(start + 0.8)!;
      expect(f.alpha).toBeGreaterThan(0.8);
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(1);
      expect(f.y).toBeGreaterThan(0);
      expect(f.y).toBeLessThan(1);
      expect(f.alpha).toBeLessThanOrEqual(0.85);
      expect(f.length).toBeLessThanOrEqual(0.13);
    }
    expect(intervals.size).toBeGreaterThan(20);
    expect(meteorFrame(meteorStart(0) + 0.8)).toEqual(
      meteorFrame(meteorStart(0) + 0.8),
    );
    expect(meteorFrame(meteorStart(1) + 0.8)?.x).not.toBe(
      meteorFrame(meteorStart(0) + 0.8)?.x,
    );
  });
  it("wandering stars follow distinct smooth bounded paths without jumping", () => {
    for (const phase of [0, 1.4, 4.2])
      for (let t = 0; t < 600; t += 0.17) {
        const p = ambientStarPosition(500, 300, phase, t),
          next = ambientStarPosition(500, 300, phase, t + 0.016);
        expect(Math.abs(p.x - 500)).toBeLessThanOrEqual(195);
        expect(Math.abs(p.y - 300)).toBeLessThanOrEqual(145);
        expect(Math.hypot(next.x - p.x, next.y - p.y)).toBeLessThan(0.13);
      }
    expect(ambientStarPosition(500, 300, 0, 30)).not.toEqual(
      ambientStarPosition(500, 300, 0, 0),
    );
    expect(ambientStarPosition(500, 300, 0, 30)).not.toEqual(
      ambientStarPosition(500, 300, 1, 30),
    );
  });
  it("reduces both texture area and animated decoration count on low quality", () => {
    const { low, normal } = ATMOSPHERE_BUDGET;
    expect(low.textureWidth * low.textureHeight).toBe(
      (normal.textureWidth * normal.textureHeight) / 4,
    );
    expect(low.dust + low.glints).toBeLessThan(
      (normal.dust + normal.glints) / 2,
    );
  });
});
