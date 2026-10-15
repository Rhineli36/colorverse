/** Stable variety for new elements; saved user colors always take precedence. */
export function growthElementColor(primary: string, index: number) {
  const n = Number.parseInt(primary.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const hue =
    d === 0
      ? 35
      : max === r
        ? 60 * (((g - b) / d) % 6)
        : max === g
          ? 60 * ((b - r) / d + 2)
          : 60 * ((r - g) / d + 4);
  const h = (((hue + index * 67) % 360) + 360) % 360,
    s = 0.65,
    l = 0.62 + (index % 3) * 0.045;
  const a = s * Math.min(l, 1 - l);
  const channel = (k: number) => {
    const x = (k + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(x - 3, 9 - x, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}
