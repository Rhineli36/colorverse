/** Decorative scenery only; these never become student planets or hit targets. */
export function createDistantPlanetField() {
  let seed = 71231;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const points: { x: number; y: number; diameter: number; skin: number }[] = [];
  for (let attempt = 0; points.length < 12 && attempt < 2000; attempt++) {
    const x = 800 + (random() - 0.5) * 14000;
    const y = 450 + (random() - 0.5) * 8000;
    // Minimum separation avoids clusters and strings of neighbouring planets.
    if (points.some((p) => Math.hypot(p.x - x, p.y - y) < 2300)) continue;
    points.push({
      x,
      y,
      diameter: 120 + random() * 90,
      skin: Math.floor(random() * 6),
    });
  }
  return points;
}

export const distantPlanetField = createDistantPlanetField();
