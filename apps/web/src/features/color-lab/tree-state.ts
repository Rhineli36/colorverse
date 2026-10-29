import { z } from "zod";
export const SEASONS = [
  {
    name: "春日初醒",
    colors: ["#B9D96B", "#7FA66C", "#EAA4B8"],
    background: "#B4AFCA",
    question: "高明度的绿色与少量粉色怎样形成层次？",
  },
  {
    name: "盛夏浓荫",
    colors: ["#2E7354", "#2B8C83", "#B4CF54"],
    background: "#55798C",
    question: "相近色中有哪些明暗与冷暖变化？",
  },
  {
    name: "秋日流金",
    colors: ["#E8AD3B", "#D97528", "#955036"],
    background: "#29435D",
    question: "冷色背景如何衬托暖色树冠？",
  },
  {
    name: "冬日静谧",
    colors: ["#BDCAD9", "#8C9EBB", "#E4E7E9"],
    background: "#52657F",
    question: "低饱和配色中的细微变化是否还清楚？",
  },
];
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const palette = z
  .object({
    season: z.number().int().min(0).max(3),
    colors: z.tuple([hex, hex, hex]),
    bark: hex,
    ground: hex,
    background: hex,
    hue: z.number().min(-180).max(180),
    saturation: z.number().min(0).max(150),
    brightness: z.number().min(30).max(170),
    accent: z.number().min(0).max(50),
    auxiliary: z.number().min(0).max(100),
  })
  .refine((v) => v.accent + v.auxiliary <= 100);
export const TreeSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(60),
  mode: z.enum(["season", "context", "free"]),
  paused: z.boolean(),
  compare: z.boolean(),
  activeSide: z.union([z.literal(0), z.literal(1)]),
  quality: z.enum(["low", "medium", "high"]),
  wind: z.number().min(0).max(100),
  orbit: z.boolean(),
  target: hex,
  reveal: z.boolean(),
  extract: z.boolean(),
  palettes: z.tuple([palette, palette]),
  camera: z.object({
    yaw: z.number().min(-10000).max(10000),
    pitch: z.number().min(0.05).max(1),
    distance: z.number().min(9).max(30),
  }),
});
export type TreeSettings = z.infer<typeof TreeSchema>;
export type TreePalette = TreeSettings["palettes"][number];
export const TREE_KEY = "colorverse.color-lab.tree.v1";
export function seasonPalette(n: number): TreePalette {
  return {
    season: n,
    colors: [...SEASONS[n].colors] as [string, string, string],
    bark: "#71513B",
    ground: "#697449",
    background: SEASONS[n].background,
    hue: 0,
    saturation: 100,
    brightness: 100,
    accent: 8,
    auxiliary: 30,
  };
}
export function treeDefaults(): TreeSettings {
  return {
    schemaVersion: 1,
    name: "我的第五季",
    mode: "season",
    paused: false,
    compare: false,
    activeSide: 0,
    quality: "medium",
    wind: 35,
    orbit: false,
    target: "#D5A84B",
    reveal: false,
    extract: false,
    palettes: [seasonPalette(2), seasonPalette(0)],
    camera: { yaw: 0.4, pitch: 0.28, distance: 17.1 },
  };
}
export function readTree() {
  try {
    return TreeSchema.parse(
      JSON.parse(localStorage.getItem(TREE_KEY) ?? "null"),
    );
  } catch {
    return treeDefaults();
  }
}
export function saveTree(v: TreeSettings) {
  try {
    localStorage.setItem(TREE_KEY, JSON.stringify(v));
  } catch {
    /* Local storage is optional. */
  }
}
export function treeMode(
  s: TreeSettings,
  mode: TreeSettings["mode"],
): TreeSettings {
  return {
    ...s,
    mode,
    activeSide: 0,
    ...(mode === "context"
      ? {
          paused: true,
          orbit: false,
          compare: true,
          reveal: false,
          extract: false,
        }
      : { extract: false }),
  };
}
