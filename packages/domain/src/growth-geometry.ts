import type { GrowthPresetId } from "@colorverse/contracts";
type Paint = "theme" | "light" | "dark" | "white";
type Style = { fill?: Paint; alpha?: number; stroke?: Paint; width?: number };
export type GrowthShape = Style &
  (
    | { kind: "circle"; x: number; y: number; radius: number }
    | { kind: "ellipse"; x: number; y: number; rx: number; ry: number }
    | { kind: "poly"; points: number[] }
    | { kind: "line"; points: number[] }
  );
const circle = (
  x: number,
  y: number,
  radius: number,
  fill: Paint = "theme",
  alpha = 1,
): GrowthShape => ({ kind: "circle", x, y, radius, fill, alpha });
const ellipse = (
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: Paint = "theme",
  alpha = 1,
): GrowthShape => ({ kind: "ellipse", x, y, rx, ry, fill, alpha });
const poly = (
  points: number[],
  fill: Paint = "theme",
  alpha = 1,
): GrowthShape => ({ kind: "poly", points, fill, alpha });
const line = (
  points: number[],
  stroke: Paint = "light",
  width = 2,
  alpha = 0.5,
): GrowthShape => ({ kind: "line", points, stroke, width, alpha });

/** Fixed, code-owned geometry shared by SVG chooser and Pixi scenes. */
export function growthShapes(id: GrowthPresetId, seed: number): GrowthShape[] {
  switch (id) {
    case "glow-flower":
      return [
        line([0, 0, 0, 90], "theme", 3, 1),
        ...Array.from({ length: 7 }, (_, k) =>
          ellipse(
            Math.cos((k * Math.PI * 2) / 7) * 22,
            Math.sin((k * Math.PI * 2) / 7) * 22,
            15,
            23,
            "theme",
            0.85,
          ),
        ),
        circle(0, 0, 12, "light"),
      ];
    case "crystal":
      return [
        {
          ...poly([0, -65, 40, -10, 28, 50, -25, 55, -45, -5], "theme", 0.8),
          stroke: "white",
          width: 2,
        },
        line([0, -65, 5, 25, 28, 50], "white", 1, 0.4),
      ];
    case "luminous-leaf":
      return [
        poly(
          [
            0, 65, -40, 25, -52, -15, -26, -53, 0, -80, 30, -52, 49, -10, 34,
            30,
          ],
          "theme",
          0.9,
        ),
        line([0, 80, 0, -65], "light", 3, 0.7),
        line([-32, 18, 0, 40, 30, 14]),
        line([-35, -15, 0, 8, 34, -20]),
        line([-20, -43, 0, -26, 22, -47]),
      ];
    case "moon-mushroom":
      return [
        ellipse(0, 69, 48, 10, "theme", 0.2),
        poly([-15, 18, 17, 18, 22, 67, -22, 67], "light", 0.8),
        poly(
          [-73, 20, -64, -12, -41, -48, 0, -62, 40, -45, 63, -12, 73, 20],
          "theme",
          0.95,
        ),
        ellipse(0, 20, 73, 14, "light", 0.3),
        circle(-32, -9, 8, "light", 0.85),
        circle(6, -31, 11, "light", 0.8),
        circle(37, 0, 7, "light", 0.85),
      ];
    case "cloudlet":
      return [
        ellipse(0, 18, 80, 25, "theme", 0.9),
        circle(-48, -2, 31, "theme", 0.9),
        circle(-8, -23, 43, "theme", 0.9),
        circle(38, -3, 34, "theme", 0.9),
        ellipse(-13, -31, 24, 12, "light", 0.28),
        circle(-45, 69, 4, "light", 0.7),
        circle(15, 82, 3, "light", 0.7),
        circle(49, 61, 4, "light", 0.7),
      ];
    case "floating-island":
      return [
        poly([-82, -8, 80, -8, 46, 39, 7, 85, -43, 41], "theme", 0.7),
        poly(
          [-82, -8, -40, -36, 38, -31, 80, -8, 24, 11, -27, 12],
          "theme",
          0.95,
        ),
        line([-73, -6, -30, 10, 23, 8, 73, -7]),
        line([-27, 13, 7, 85, 29, 15], "light", 1, 0.4),
        poly([-23, -26, -4, -67, 16, -26], "light", 0.7),
        circle(46, 64, 7, "theme", 0.65),
      ];
    case "star-seed": {
      const tips = 5 + (seed % 2);
      const points = Array.from({ length: tips * 2 }, (_, k) => {
        const angle = (k * Math.PI) / tips - Math.PI / 2,
          r = k % 2 ? 26 : 69;
        return [Math.cos(angle) * r, Math.sin(angle) * r];
      }).flat();
      return [
        { ...poly(points, "theme", 0.9), stroke: "light", width: 2 },
        circle(0, 0, 15, "light", 0.95),
        circle(-73, -59, 3, "light"),
        circle(80, 36, 4, "light"),
        circle(-48, 80, 3, "light"),
      ];
    }
    case "orbit-stone":
      return [
        { ...ellipse(0, 10, 87, 25, "theme", 0.12), stroke: "light", width: 2 },
        poly(
          [-39, -39, 3, -56, 47, -24, 51, 29, 13, 56, -40, 33, -55, -2],
          "theme",
          0.95,
        ),
        poly([-39, -39, 3, -56, 11, -11, -55, -2], "light", 0.25),
        poly([11, -11, 51, 29, 13, 56, -13, 25], "dark", 0.25),
        line([-78, 22, -43, 32, 8, 35, 51, 28, 84, 11]),
        circle(79, 12, 7, "light", 0.9),
      ];
  }
}
export function growthPaint(color: string) {
  return { theme: color, light: "#fff5c9", dark: "#14253a", white: "#ffffff" };
}
