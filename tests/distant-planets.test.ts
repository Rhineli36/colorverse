import { expect, it } from "vitest";
import { createDistantPlanetField } from "../apps/web/src/features/classroom/distant-planets";

it("disperses stable scenery over the universe with space between planets", () => {
  const planets = createDistantPlanetField();
  expect(planets).toHaveLength(12);
  expect(createDistantPlanetField()).toEqual(planets);
  for (const [i, p] of planets.entries()) {
    for (const other of planets.slice(i + 1))
      expect(Math.hypot(p.x - other.x, p.y - other.y)).toBeGreaterThanOrEqual(
        2300,
      );
  }
  // Populate every quadrant, including well beyond the central student cluster.
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      expect(
        planets.some((p) => (p.x - 800) * x > 3000 && (p.y - 450) * y > 1500),
      ).toBe(true);
});
