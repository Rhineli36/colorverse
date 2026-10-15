/** A stable, bounded placement chosen once at upload; existing user placements are never moved. */
export function nextGrowthPlacement(
  existing: { x: number; y: number }[],
  seed = 0,
) {
  const halton = (n: number, base: number) => {
    let value = 0,
      factor = 1 / base;
    while (n > 0) {
      value += (n % base) * factor;
      n = Math.floor(n / base);
      factor /= base;
    }
    return value;
  };
  let best = { x: 0.28, y: 0.64 },
    distance = -1;
  for (let i = 1; i <= 96; i++) {
    const k = i + Math.abs(seed % 41),
      p = { x: 0.12 + 0.76 * halton(k, 2), y: 0.2 + 0.62 * halton(k, 3) },
      d = existing.length
        ? Math.min(...existing.map((q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2))
        : -((p.x - 0.3) ** 2 + (p.y - 0.62) ** 2);
    if (d > distance || i === 1) {
      best = p;
      distance = d;
    }
  }
  return { ...best, size: 0.74, motion: "float" as const };
}
