import { expect, it } from "vitest";
import { nextGrowthPlacement, growthElementColor } from "@colorverse/domain";
import { LearningContent } from "@colorverse/contracts";
it("assigns distinct stable colors to five new elements without randomizing saved colors", () => {
  for (const primary of ["#5A9DDE", "#EFA568", "#888888"]) {
    const colors = Array.from({ length: 5 }, (_, i) =>
      growthElementColor(primary, i),
    );
    expect(new Set(colors).size).toBe(5);
    expect(colors).toEqual(
      Array.from({ length: 5 }, (_, i) => growthElementColor(primary, i)),
    );
    colors.forEach((c) => expect(c).toMatch(/^#[A-F0-9]{6}$/));
  }
});
it("places five visible growth entries apart, deterministically and without moving earlier works", () => {
  const points: ReturnType<typeof nextGrowthPlacement>[] = [];
  for (let i = 0; i < 5; i++) {
    const before = JSON.stringify(points),
      p = nextGrowthPlacement(points, 4);
    expect(p).toEqual(nextGrowthPlacement(points, 4));
    expect(JSON.stringify(points)).toBe(before);
    expect(p.x).toBeGreaterThanOrEqual(0.12);
    expect(p.x).toBeLessThanOrEqual(0.88);
    expect(p.y).toBeGreaterThanOrEqual(0.2);
    expect(p.y).toBeLessThanOrEqual(0.82);
    for (const q of points)
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(0.23);
    points.push(p);
  }
});
it("shares the requested color starting points and open-ended emotion guidance", () => {
  expect(LearningContent.colors.slice(0, 8).map((c) => c.exampleHex)).toEqual([
    "#E85D5D",
    "#F3A052",
    "#F2D15C",
    "#69B98C",
    "#5B8FD9",
    "#9A7BD1",
    "#E9A0B7",
    "#58BFC2",
  ]);
  expect(new Set(LearningContent.colors.map((c) => c.id)).size).toBe(12);
  for (const c of LearningContent.colors) {
    expect(c.words).toBeTruthy();
    expect(c.body).toBeTruthy();
    expect(c.tryPrompt).toBeTruthy();
  }
  expect(LearningContent.notice).toContain("没有唯一的情感答案");
});
