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
    case "aurora-jelly":
      return [
        ellipse(0, -12, 62, 40, "theme", 0.8),
        ellipse(0, 12, 62, 15, "light", 0.3),
        ...[-36, -12, 12, 36].map((x) =>
          line([x, 18, x - 10, 44, x + 8, 68, x, 86], "theme", 5, 0.8),
        ),
        circle(-20, -23, 9, "light", 0.35),
      ];
    case "moon-bloom":
      return [
        line([0, 10, 0, 82], "theme", 4, 1),
        poly([-3, 54, -40, 28, -45, 48, -3, 65], "theme", 0.8),
        poly([0, 42, 36, 16, 42, 38, 0, 60], "light", 0.6),
        poly(
          [
            -38, -34, -8, -62, 33, -49, 14, -41, -4, -31, -12, -6, -8, 17, -32,
            4, -44, -16,
          ],
          "theme",
          0.95,
        ),
        circle(22, -7, 10, "light"),
      ];
    case "coral-fan":
      return [
        line([0, 80, 0, -62], "theme", 6, 1),
        ...[-1, 1].flatMap((s) => [
          line([0, 44, s * 44, 3, s * 56, -40], "theme", 5, 0.9),
          line([0, 10, s * 25, -22, s * 32, -64], "theme", 4, 0.9),
          line([s * 44, 3, s * 76, -8, s * 80, -38], "theme", 3, 0.8),
          circle(s * 32, -64, 6, "light", 0.8),
        ]),
        ellipse(0, 80, 30, 8, "light", 0.4),
      ];
    case "comet":
      return [
        poly([-70, 70, -15, -6, 57, -64, 28, 13], "theme", 0.3),
        poly([-40, 57, 9, -20, 57, -64, 30, 6], "light", 0.35),
        circle(40, -44, 24, "theme"),
        circle(35, -50, 12, "light", 0.8),
        line([-68, 20, -27, -18], "light", 2, 0.5),
        circle(-46, 53, 3, "light"),
      ];
    case "butterfly":
      return [-1, 1]
        .flatMap((s) => [
          poly(
            [0, 0, s * 31, -68, s * 73, -43, s * 63, 7, 0, 15],
            "theme",
            0.85,
          ),
          poly([0, 12, s * 62, 9, s * 55, 59, s * 19, 42], "theme", 0.65),
          circle(s * 40, -25, 14, "light", 0.3),
          line([0, -6, s * 13, -33], "light", 2, 0.8),
        ])
        .concat([ellipse(0, 8, 5, 31, "light", 0.9)]);
    case "ice-spire":
      return [
        poly([-50, 60, -50, 5, -30, -48, -8, 12, -8, 60], "theme", 0.7),
        poly([-18, 64, -18, -29, 8, -84, 33, -30, 33, 64], "theme"),
        poly([33, 64, 34, 7, 52, -35, 69, 6, 68, 64], "theme", 0.6),
        line([8, -80, 8, 62], "white", 2, 0.6),
        poly([8, -84, 33, -30, 8, -16], "light", 0.5),
      ];
    case "sun-disc":
      return [
        ...Array.from({ length: 8 }, (_, k) => {
          const a = (k * Math.PI) / 4;
          return line(
            [
              Math.cos(a) * 57,
              Math.sin(a) * 57,
              Math.cos(a) * 80,
              Math.sin(a) * 80,
            ],
            "theme",
            5,
            0.85,
          );
        }),
        circle(0, 0, 45, "theme"),
        circle(0, 0, 32, "light", 0.5),
        circle(-12, -13, 9, "white", 0.4),
      ];
    case "rain-drop":
      return [
        poly(
          [0, -78, 36, -17, 49, 23, 35, 57, 0, 72, -35, 57, -49, 23, -36, -17],
          "theme",
          0.85,
        ),
        ellipse(-17, 18, 12, 22, "light", 0.4),
        circle(-13, 38, 4, "white", 0.8),
        circle(55, -52, 5, "light", 0.8),
      ];
    case "satellite":
      return [
        poly([-26, -25, 27, -25, 27, 26, -26, 26], "theme"),
        poly([-80, -32, -36, -32, -36, 33, -80, 33], "theme", 0.5),
        poly([36, -32, 80, -32, 80, 33, 36, 33], "theme", 0.5),
        line([-80, 0, -36, 0], "light", 2, 0.8),
        line([36, 0, 80, 0], "light", 2, 0.8),
        line([0, -25, 0, -58], "light", 3, 0.9),
        circle(0, -60, 5, "light"),
        circle(0, 0, 12, "light", 0.65),
        poly([-20, 31, 0, 55, 20, 31], "light", 0.4),
      ];
    case "nebula-shell":
      return [
        poly(
          [
            -70, 35, -69, -16, -44, -60, 0, -78, 44, -60, 69, -16, 70, 35, 0,
            62,
          ],
          "theme",
          0.85,
        ),
        ...[-52, -26, 0, 26, 52].map((x) =>
          line([0, 62, x, x === 0 ? -74 : -50], "light", 2, 0.6),
        ),
        ellipse(0, 63, 23, 9, "light", 0.7),
      ];
    case "little-tree":
      return [
        poly([-10, 82, 10, 82, 7, -8, -7, -8], "light", 0.7),
        circle(-28, -10, 34, "theme", 0.8),
        circle(26, -18, 40, "theme", 0.8),
        circle(0, -49, 35, "theme"),
        circle(-7, -63, 11, "light", 0.3),
        circle(-52, -24, 4, "light"),
        circle(38, -58, 4, "light"),
        ellipse(0, 84, 42, 7, "theme", 0.25),
      ];
    case "lotus":
      return [
        ellipse(0, 61, 81, 12, "theme", 0.2),
        poly([0, 42, -37, -21, 0, -74, 37, -21], "theme"),
        poly([0, 44, -66, 23, -76, -30, -25, -4], "theme", 0.8),
        poly([0, 44, 66, 23, 76, -30, 25, -4], "theme", 0.8),
        poly([0, 44, -65, 48, -82, 7, -35, 17], "light", 0.55),
        poly([0, 44, 65, 48, 82, 7, 35, 17], "light", 0.55),
        circle(0, 34, 9, "light", 0.8),
      ];
    case "meteor-cluster":
      return [
        poly([-35, -45, -3, -72, 35, -54, 47, -14, 10, 3, -26, -9], "theme"),
        poly(
          [-73, 34, -46, 12, -20, 27, -22, 64, -53, 73, -78, 55],
          "theme",
          0.8,
        ),
        poly([30, 45, 58, 25, 83, 47, 70, 77, 37, 76], "theme", 0.65),
        line([-35, -45, 3, -31, 35, -54], "light", 2, 0.5),
        circle(-48, 42, 9, "dark", 0.3),
        circle(11, -31, 8, "light", 0.25),
      ];
    case "light-lantern":
      return [
        line([0, -82, 0, -47], "light", 2, 0.9),
        poly([-35, -48, 35, -48, 46, 15, 0, 54, -46, 15], "theme", 0.75),
        poly([-10, -43, 10, -43, 17, 14, 0, 37, -17, 14], "light", 0.65),
        line([-35, -48, 0, -58, 35, -48], "light", 3, 0.8),
        line([0, 53, 0, 78], "theme", 3, 0.8),
        circle(0, 80, 4, "light"),
      ];
    case "rainbow-arch": {
      const arc = (r: number) =>
        Array.from({ length: 15 }, (_, k) => [
          -Math.cos((k * Math.PI) / 14) * r,
          50 - Math.sin((k * Math.PI) / 14) * r,
        ]).flat();
      return [
        line(arc(78), "theme", 12, 0.9),
        line(arc(59), "light", 8, 0.65),
        line(arc(44), "theme", 6, 0.45),
        ellipse(-77, 55, 19, 8, "light", 0.25),
        ellipse(77, 55, 19, 8, "light", 0.25),
      ];
    }
    case "cosmic-eye":
      return [
        poly(
          [-85, 0, -44, -39, 0, -48, 44, -39, 85, 0, 44, 39, 0, 48, -44, 39],
          "theme",
          0.45,
        ),
        circle(0, 0, 37, "theme", 0.9),
        circle(0, 0, 20, "dark", 0.9),
        circle(-10, -12, 8, "light", 0.9),
        line([-60, -29, -71, -45], "light", 2, 0.7),
        line([60, -29, 71, -45], "light", 2, 0.7),
      ];
    case "snow-flake":
      return Array.from({ length: 6 }, (_, k) => {
        const a = (k * Math.PI) / 3,
          c = Math.cos(a),
          s = Math.sin(a);
        return [
          line([0, 0, c * 77, s * 77], "theme", 4, 1),
          line(
            [
              c * 33 - s * 17,
              s * 33 + c * 17,
              c * 51,
              s * 51,
              c * 33 + s * 17,
              s * 33 - c * 17,
            ],
            "light",
            3,
            0.8,
          ),
        ];
      })
        .flat()
        .concat([circle(0, 0, 10, "light", 0.8)]);
    case "feather":
      return [
        poly(
          [-35, 57, -46, 8, -28, -45, 14, -80, 41, -59, 44, -14, 19, 33],
          "theme",
          0.9,
        ),
        line([-34, 83, 20, -66], "light", 3, 0.7),
        ...[-20, 0, 20, 40].map((y) =>
          line([-30, y + 14, -4, y + 24, 28, y - 8], "light", 1, 0.6),
        ),
      ];
    case "bubble-cluster":
      return [
        [-34, 14, 40],
        [31, -25, 32],
        [39, 53, 22],
        [-49, -54, 17],
      ].flatMap(([x, y, r]) => [
        {
          ...circle(x, y, r, "theme", 0.3),
          stroke: "light" as const,
          width: 2,
        },
        ellipse(x - r / 3, y - r / 3, r / 3, r / 5, "light", 0.7),
      ]);
    case "mountain":
      return [
        poly([-87, 66, -32, -64, 20, 66], "theme", 0.65),
        poly([-37, 66, 29, -82, 86, 66], "theme", 0.95),
        poly([29, -82, 6, -31, 30, -44, 52, -22], "light", 0.85),
        poly([-32, -64, -50, -22, -31, -34, -14, -20], "light", 0.6),
        line([-76, 74, 72, 74], "light", 2, 0.3),
      ];
    case "spiral-galaxy":
      return [
        ...Array.from({ length: 3 }, (_, k) =>
          line(
            Array.from({ length: 24 }, (_, i) => {
              const a = i * 0.23 + (k * Math.PI * 2) / 3,
                r = 10 + i * 3;
              return [Math.cos(a) * r, Math.sin(a) * r * 0.65];
            }).flat(),
            "theme",
            7,
            0.55,
          ),
        ),
        circle(0, 0, 14, "light", 0.9),
        circle(-75, -37, 3, "light"),
        circle(65, 48, 4, "light"),
      ];
    case "portal":
      return [
        { ...ellipse(0, 0, 55, 79, "theme", 0.18), stroke: "theme", width: 8 },
        { ...ellipse(0, 0, 42, 65, "dark", 0.7), stroke: "light", width: 2 },
        line([-24, -45, 8, -22, -9, 4, 23, 29], "theme", 5, 0.8),
        poly([-65, 72, -35, 52, 35, 52, 65, 72], "theme", 0.8),
        circle(-57, -7, 6, "light"),
        circle(55, 10, 5, "light"),
      ];
  }
}
export function growthPaint(color: string) {
  return { theme: color, light: "#fff5c9", dark: "#14253a", white: "#ffffff" };
}
