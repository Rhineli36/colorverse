export const GrowthPresetIds = [
  "glow-flower",
  "crystal",
  "luminous-leaf",
  "moon-mushroom",
  "cloudlet",
  "floating-island",
  "star-seed",
  "orbit-stone",
] as const;
export type GrowthPresetId = (typeof GrowthPresetIds)[number];
export const GrowthLibrarySpec = {
  version: "1.0.0",
  rendering: "programmatic",
  baseSizePx: 200,
  maxShapes: 16,
  provenance: "AI-assisted project code",
  license: "unspecified",
  parameterSchema: "GrowthParamsSchema",
} as const;
export const GROWTH_LIBRARY_CAPABILITY = "growth-library@1";
export const GrowthPresets: Record<
  GrowthPresetId,
  {
    name: string;
    category: string;
    keywords: readonly string[];
    capability: "preset-layer@1" | "growth-library@1";
  }
> = {
  "glow-flower": {
    name: "微光花",
    category: "植物",
    keywords: ["花", "春", "温柔", "flower", "warm"],
    capability: "preset-layer@1",
  },
  crystal: {
    name: "晶体",
    category: "矿物",
    keywords: ["冷", "蓝", "冰", "晶", "几何", "ice"],
    capability: "preset-layer@1",
  },
  "luminous-leaf": {
    name: "发光叶片",
    category: "植物",
    keywords: ["绿", "叶", "自然", "生机", "green"],
    capability: "growth-library@1",
  },
  "moon-mushroom": {
    name: "月光蘑菇",
    category: "植物",
    keywords: ["森林", "蘑菇", "梦幻", "神秘", "forest"],
    capability: "growth-library@1",
  },
  cloudlet: {
    name: "彩色云朵",
    category: "天空",
    keywords: ["云", "天空", "柔软", "宁静", "cloud"],
    capability: "growth-library@1",
  },
  "floating-island": {
    name: "漂浮岛",
    category: "地形",
    keywords: ["岛", "山", "大地", "自由", "land"],
    capability: "growth-library@1",
  },
  "star-seed": {
    name: "星光种子",
    category: "光效",
    keywords: ["星", "光", "明亮", "希望", "star"],
    capability: "growth-library@1",
  },
  "orbit-stone": {
    name: "轨道石",
    category: "轨道物件",
    keywords: ["宇宙", "轨道", "月", "石", "space"],
    capability: "growth-library@1",
  },
};
