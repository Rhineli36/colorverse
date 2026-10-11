import { describe, expect, it } from "vitest";
import { UniverseSchema } from "@colorverse/contracts";
import { fixturePlanet, fixtureUniverse } from "@colorverse/fixtures";
import {
  planetOrbit,
  planetDisplayScale,
  orbitPosition,
  orbitBounds,
  overviewCamera,
  nextPlanetPosition,
  cameraAt,
  zoomAt,
  regionCamera,
  PLANET_FOCUS_ZOOM,
  cameraTransitionAmount,
  CLASSROOM_SPACE,
  CLASSROOM_BOUNDS,
  clampPlanetPosition,
  isPlanetInsideClassroom,
} from "@colorverse/domain";
import type { PlanetMotion } from "@colorverse/contracts";

describe("bounded classroom deployment", () => {
  it("fills the 16:9 reference viewport at 4–5%, inside the larger scenery", () => {
    expect(CLASSROOM_SPACE.width * 0.04).toBe(1600);
    expect(CLASSROOM_SPACE.height * 0.04).toBe(900);
    expect(CLASSROOM_SPACE.width * 0.05).toBeGreaterThan(1600);
    expect(CLASSROOM_SPACE.height * 0.05).toBeGreaterThan(900);
  });
  it("keeps every body and complete path inside all four edges without changing source entries", () => {
    const entry = fixtureUniverse([fixturePlanet(0)]).entries[0];
    const motions: (PlanetMotion | undefined)[] = [undefined];
    for (const mode of ["stationary", "slow", "fast"] as const)
      for (const trajectory of [
        "circle",
        "ellipse",
        "figure-eight",
        "drift",
      ] as const)
        for (const direction of ["forward", "reverse"] as const)
          motions.push({
            version: "1.0.0",
            mode,
            trajectory,
            range: "wide",
            direction,
          });
    for (const motion of motions)
      for (const seed of [0, 42, 117]) {
        const original = { ...entry, motion, scale: 1.2 },
          copy = structuredClone(original);
        expect(clampPlanetPosition(original, seed, { x: 800, y: 450 })).toEqual(
          { x: 800, y: 450 },
        );
        for (const x of [-100000, 100000])
          for (const y of [-100000, 100000]) {
            const position = clampPlanetPosition(original, seed, { x, y });
            const placed = { ...original, position };
            expect(isPlanetInsideClassroom(placed, seed)).toBe(true);
            const orbit = planetOrbit(placed, seed),
              radius = 256 * 1.2 * 0.9;
            for (let i = 0; i <= 128; i++) {
              const p = orbitPosition(orbit, (orbit.periodSec * i) / 128);
              expect(p.x - radius).toBeGreaterThanOrEqual(
                CLASSROOM_BOUNDS.left - 1e-7,
              );
              expect(p.x + radius).toBeLessThanOrEqual(
                CLASSROOM_BOUNDS.right + 1e-7,
              );
              expect(p.y - radius).toBeGreaterThanOrEqual(
                CLASSROOM_BOUNDS.top - 1e-7,
              );
              expect(p.y + radius).toBeLessThanOrEqual(
                CLASSROOM_BOUNDS.bottom + 1e-7,
              );
            }
          }
        expect(original).toEqual(copy);
      }
  });
  it("allocates 250 distinct new anchors inside the classroom with orbit margins", () => {
    const entry = fixtureUniverse([fixturePlanet(0)]).entries[0],
      entries = [];
    for (let i = 0; i < 250; i++) {
      const position = nextPlanetPosition(entries, 42);
      expect(
        entries.every(
          (e) =>
            Math.hypot(e.position.x - position.x, e.position.y - position.y) >
            460,
        ),
      ).toBe(true);
      const next = { ...entry, planetId: `new-${i}`, position };
      expect(isPlanetInsideClassroom(next, 42)).toBe(true);
      entries.push(next);
    }
  });
});

describe("universe motion and cameras", () => {
  it("focuses at the reference 38% scale with gentler frame-independent easing", () => {
    expect(PLANET_FOCUS_ZOOM).toBe(0.38);
    expect(cameraTransitionAmount(0.1, true)).toBeLessThan(
      cameraTransitionAmount(0.1, false),
    );
    expect(1 - (1 - cameraTransitionAmount(0.1, true)) ** 10).toBeCloseTo(
      cameraTransitionAmount(1, true),
    );
    expect(cameraTransitionAmount(1.25, true)).toBeCloseTo(0.95, 2);
    expect(cameraTransitionAmount(0.1, true, true)).toBe(1);
  });
  it("bounds legacy and new display sizes without changing saved layouts", () => {
    const original = fixtureUniverse([fixturePlanet(0), fixturePlanet(1)]);
    original.entries[0].scale = 0.1;
    original.entries[1].scale = 2;
    const before = structuredClone(original);
    expect(planetDisplayScale(0.1)).toBe(0.8);
    expect(planetDisplayScale(2)).toBe(1.2);
    expect(planetDisplayScale(1.1)).toBe(1.1);
    expect(planetDisplayScale(NaN)).toBe(1);
    expect(orbitBounds(original.entries[0], 42)).toEqual(
      orbitBounds({ ...original.entries[0], scale: 0.8 }, 42),
    );
    expect(orbitBounds(original.entries[1], 42)).toEqual(
      orbitBounds({ ...original.entries[1], scale: 1.2 }, 42),
    );
    expect(original).toEqual(before);
  });
  const u = fixtureUniverse(
    Array.from({ length: 6 }, (_, i) => fixturePlanet(i)),
  );
  it("derives distinct repeatable slow paths without changing persisted anchors", () => {
    const before = structuredClone(u);
    const orbits = u.entries.map((e) => planetOrbit(e, u.layout.seed));
    expect(planetOrbit(u.entries[0], 42)).toEqual(orbits[0]);
    expect(new Set(orbits.map((o) => o.periodSec)).size).toBe(6);
    for (const [i, o] of orbits.entries()) {
      expect(o.periodSec).toBeGreaterThanOrEqual(90);
      const initial = orbitPosition(o, 0),
        closed = orbitPosition(o, o.periodSec);
      expect(initial.x).toBeCloseTo(u.entries[i].position.x);
      expect(initial.y).toBeCloseTo(u.entries[i].position.y);
      expect(closed.x).toBeCloseTo(initial.x);
      expect(closed.y).toBeCloseTo(initial.y);
      expect(orbitPosition(o, 10)).not.toEqual(initial);
    }
    expect(u).toEqual(before);
  });
  it("bounds include the planet at every point of its ellipse", () => {
    for (const e of u.entries) {
      const o = planetOrbit(e, 42),
        b = orbitBounds(e, 42),
        r = 256 * e.scale * 0.9;
      for (let t = 0; t < o.periodSec; t += 0.5) {
        const p = orbitPosition(o, t);
        expect(p.x - r).toBeGreaterThanOrEqual(b.left - 1e-6);
        expect(p.x + r).toBeLessThanOrEqual(b.right + 1e-6);
        expect(p.y - r).toBeGreaterThanOrEqual(b.top - 1e-6);
        expect(p.y + r).toBeLessThanOrEqual(b.bottom + 1e-6);
      }
    }
  });
  it("allocates 24 separated anchors and fits complete paths in the panorama", () => {
    const expanded = structuredClone(u);
    for (let i = 6; i < 24; i++) {
      const position = nextPlanetPosition(expanded.entries, 42);
      expect(
        expanded.entries.every(
          (e) =>
            Math.hypot(e.position.x - position.x, e.position.y - position.y) >
            460,
        ),
      ).toBe(true);
      expanded.entries.push({
        ...u.entries[1],
        planetId: fixturePlanet(i).planetId,
        position,
      });
    }
    const viewport = { width: 1440, height: 868 },
      base = Math.min(viewport.width / 1600, viewport.height / 900);
    const camera = overviewCamera(expanded.entries, 42, viewport);
    expect(camera.zoom).toBeLessThanOrEqual(
      overviewCamera(u.entries, 42, viewport).zoom,
    );
    for (const e of expanded.entries) {
      const b = orbitBounds(e, 42);
      const x = (p: number) =>
        viewport.width / 2 + (p - 800) * base * camera.zoom + camera.x * base;
      const y = (p: number) =>
        viewport.height / 2 + (p - 450) * base * camera.zoom + camera.y * base;
      expect(x(b.left)).toBeGreaterThanOrEqual(0);
      expect(x(b.right)).toBeLessThanOrEqual(viewport.width);
      expect(y(b.top)).toBeGreaterThanOrEqual(120 - 1e-6);
      expect(y(b.bottom)).toBeLessThanOrEqual(viewport.height - 135 + 1e-6);
    }
    expect(
      UniverseSchema.safeParse({
        ...expanded,
        layout: { ...expanded.layout, camera },
      }).success,
    ).toBe(true);
    expect(expanded.entries.slice(0, 6)).toEqual(u.entries);
  });
  it("ignores hidden entries when fitting and handles empty results", () => {
    const viewport = { width: 1440, height: 868 };
    expect(
      overviewCamera(
        [
          ...u.entries,
          { ...u.entries[0], visible: false, position: { x: 10000, y: 10000 } },
        ],
        42,
        viewport,
      ),
    ).toEqual(overviewCamera(u.entries, 42, viewport));
    expect(overviewCamera([], 42, viewport).zoom).toBeLessThanOrEqual(0.32);
  });
  it("centers a focused world position using the existing camera convention", () => {
    const p = { x: 1300, y: -200 },
      c = cameraAt(p, 1.25);
    expect((p.x - 800) * c.zoom + c.x).toBe(0);
    expect((p.y - 450) * c.zoom + c.y).toBe(0);
  });
  it("zooms around an arbitrary point without making it drift on screen", () => {
    const c = { x: 330, y: -190, zoom: 0.22 },
      point = { x: -900, y: 1200 },
      next = zoomAt(c, point, 0.75);
    expect((point.x - 800) * next.zoom + next.x).toBeCloseTo(
      (point.x - 800) * c.zoom + c.x,
    );
    expect((point.y - 450) * next.zoom + next.y).toBeCloseTo(
      (point.y - 450) * c.zoom + c.y,
    );
    expect(zoomAt(c, point, 100).zoom).toBe(2.5);
    expect(zoomAt(c, point, 0.001).zoom).toBe(0.04);
  });
  it("frames an arbitrary region and maintains a broad empty-space context", () => {
    const viewport = { width: 1600, height: 900 },
      c = regionCamera(
        { left: -1200, right: -400, top: 200, bottom: 600 },
        viewport,
      );
    expect(c.zoom).toBe(1.575);
    expect((-800 - 800) * c.zoom + c.x).toBe(0);
    expect((400 - 450) * c.zoom + c.y).toBe(0);
    expect(
      overviewCamera(u.entries.slice(0, 1), 42, viewport).zoom,
    ).toBeLessThan(0.25);
  });
});
