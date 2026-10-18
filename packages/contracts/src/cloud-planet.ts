import { z } from "zod";
import { MotionSchema } from "./motion";
import { LearningIntentSchema } from "./learning";

export const DefaultCloudMotion = {
  version: "1.0.0",
  mode: "stationary",
  trajectory: "ellipse",
  range: "regular",
  direction: "forward",
} as const;

export const CloudPlanetPresets = [
  {
    name: "流焰星",
    color: "#efa568",
    mood: "温暖",
    summary:
      "把一小片落日留在宇宙里。希望来到这里的人，都能带走一点温暖和勇气。",
    reflection: "想试着让橙色与暗红相遇，把明亮留给最想被看见的地方。",
  },
  {
    name: "翡翠星",
    color: "#82c9ae",
    mood: "宁静",
    summary: "这是一颗慢慢生长的星球。让绿色铺开，也给呼吸和想象留一点空白。",
    reflection:
      "从一片叶子的颜色出发，试试偏黄与偏蓝的绿色，会长出怎样不同的心情。",
  },
  {
    name: "潮汐星",
    color: "#5a9dde",
    mood: "清凉",
    summary:
      "沿着蓝色的波纹去旅行。希望这片小小的海，让忙碌的心情也能安静下来。",
    reflection:
      "想用深浅不同的蓝色写出远近，再让一小点暖色像岸边的灯一样亮起来。",
  },
  {
    name: "紫雾星",
    color: "#b397d4",
    mood: "神秘",
    summary: "把没说完的想象藏进紫色的夜里。这颗星球，欢迎所有奇奇怪怪的梦。",
    reflection:
      "粉紫、蓝紫和暗色之间，会不会藏着一条通往梦境的小路？我想慢慢试出来。",
  },
  {
    name: "霜蓝星",
    color: "#92c7df",
    mood: "轻盈",
    summary:
      "这里收藏清晨的微光与透明的风。愿每一次相遇，都像光穿过晶体一样清澈。",
    reflection:
      "先从浅蓝开始，比较一点灰、一点白和一点亮色，看看画面怎样变得通透。",
  },
  {
    name: "月岩星",
    color: "#c5bdaa",
    mood: "宁静",
    summary:
      "在月光和灰色之间，给故事留一点安静的位置。这里不急着闪耀，也有自己的光。",
    reflection:
      "想看看不那么鲜艳的颜色，能不能用细微的明暗变化，讲出同样丰富的故事。",
  },
] as const;

export const CloudPlanetPositionSchema = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});
export const CloudPlanetPositionInput = z.strictObject({
  position: CloudPlanetPositionSchema,
  revision: z.number().int().nonnegative(),
});
export const CloudPlanetVisibilityInput = z.strictObject({
  visible: z.boolean(),
  revision: z.number().int().nonnegative(),
});

export const CloudPlanetAppearanceInput = z.strictObject({
  useDefaultExterior: z.boolean().optional(),
  haloIntensity: z.number().min(0).max(1).optional(),
  interiorView: z
    .object({
      fit: z.enum(["contain", "cover"]),
      environmentLight: z.number().min(0).max(1),
      brightness: z.number().min(0.5).max(1.5).default(1),
      saturation: z.number().min(0).max(2).default(1),
      backgroundVisible: z.boolean(),
      particlesVisible: z.boolean(),
      elementsVisible: z.boolean(),
    })
    .optional(),
  learningIntent: LearningIntentSchema.optional(),
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[a-f0-9]{6}$/i),
  skin: z.number().int().min(0).max(5).default(0),
  summary: z.string().trim().max(1000).optional(),
  reflection: z.string().trim().max(1500).optional(),
  courseNotes: z.string().trim().max(1000).optional(),
  demoWriting: z.boolean().optional(),
  atmosphere: z.enum(["none", "stardust", "fireflies"]).optional(),
  halo: z.enum(["none", "soft", "ring"]).optional(),
  motion: MotionSchema.optional(),
  brightness: z.number().min(0.5).max(1.5).optional(),
  saturation: z.number().min(0).max(2).optional(),
  practice: z.literal("tone").optional(),
});
export const CloudPlanetDocumentSchema = z.object({
  visible: z.boolean().default(true),
  useDefaultExterior: z.boolean().default(false),
  haloIntensity: z.number().min(0).max(1).default(0.6),
  interiorView: z
    .object({
      fit: z.enum(["contain", "cover"]).default("contain"),
      environmentLight: z.number().min(0).max(1).default(0.2),
      brightness: z.number().min(0.5).max(1.5).default(1),
      saturation: z.number().min(0).max(2).default(1),
      backgroundVisible: z.boolean().default(true),
      particlesVisible: z.boolean().default(true),
      elementsVisible: z.boolean().default(true),
    })
    .default({
      fit: "contain",
      environmentLight: 0.2,
      brightness: 1,
      saturation: 1,
      backgroundVisible: true,
      particlesVisible: true,
      elementsVisible: true,
    }),
  position: CloudPlanetPositionSchema.optional(),
  learningIntent: LearningIntentSchema.nullable().optional(),
  metadata: z.object({
    name: z.string(),
    summary: z.string().default(""),
    reflection: z.string().max(1500).optional(),
    courseNotes: z.string().max(1000).optional(),
    demoWriting: z.boolean().optional(),
  }),
  color: z.string().default("#82c9c7"),
  skin: z.number().int().min(0).max(5).default(0),
  revision: z.number().int().nonnegative().default(0),
  atmosphere: z.enum(["none", "stardust", "fireflies"]).default("none"),
  halo: z.enum(["none", "soft", "ring"]).default("none"),
  motion: MotionSchema.default(DefaultCloudMotion),
  brightness: z.number().min(0.5).max(1.5).default(1),
  saturation: z.number().min(0).max(2).default(1),
  media: z
    .object({
      exterior: z.object({ id: z.uuid() }).optional(),
      interior: z.object({ id: z.uuid() }).optional(),
    })
    .default({}),
});

/** A complete starting point shared by the cloud and offline creation flows. */
export function cloudPlanetFromPreset(skin: number) {
  const preset = CloudPlanetPresets[skin] ?? CloudPlanetPresets[0];
  const index = CloudPlanetPresets.indexOf(preset);
  return CloudPlanetDocumentSchema.parse({
    skin: index,
    color: preset.color,
    halo: "soft",
    metadata: {
      name: preset.name,
      summary: preset.summary,
      reflection: preset.reflection,
    },
    learningIntent: { customMood: preset.mood, paletteColors: [preset.color] },
  });
}

export const CloudGuideSteps = [
  {
    id: "exterior",
    title: "设计星球外貌",
    detail: "上传自己的外貌图片，让同学一眼认出你的星球。",
    action: "替换外貌图片",
    group: "设计你的星球",
  },
  {
    id: "atmosphere",
    title: "点亮粒子氛围",
    detail: "选择粒子或光晕，也可以在「星球运行」中设置绕行轨迹。",
    action: "选择粒子效果",
    group: "设计你的星球",
  },
  {
    id: "interior",
    title: "布置内部背景",
    detail: "上传一张场景图，作为展示作品的空间。",
    action: "替换内部背景",
    group: "设计你的星球",
  },
  {
    id: "tone",
    title: "调整色调与细节",
    detail: "试试环境颜色、背景亮度和饱和度，再保存你的选择。",
    action: "调整色调",
    group: "设计你的星球",
  },
  {
    id: "summary",
    title: "写下星球介绍",
    detail: "给星球起名，用一段文字介绍你的设计和想法。",
    action: "填写星球介绍",
    group: "设计你的星球",
  },
  {
    id: "work",
    title: "上传第一件展示作业",
    detail: "选一件满意的作业。上传成功后，欣赏新元素的生长。",
    action: "上传展示作业",
    group: "让作品生长",
  },
  {
    id: "element",
    title: "设计你的成长元素",
    detail: "挑选元素，调整颜色和运动状态，在画面拖动后保存。",
    action: "编辑成长元素",
    group: "让作品生长",
  },
  {
    id: "visit",
    title: "拜访一位同学",
    detail: "进入其他同学的星球，看看对方的设计和展示作品。",
    action: "拜访同学",
    group: "与同学相遇",
  },
  {
    id: "reaction",
    title: "送出点赞或表情",
    detail: "对喜欢的星球或作品送出一个回应。",
    action: "去互动",
    group: "与同学相遇",
  },
  {
    id: "comment",
    title: "留下一条评价",
    detail: "说说喜欢的色彩、构图或可以尝试的方向，给同学具体的反馈。",
    action: "写下留言",
    group: "与同学相遇",
  },
] as const;
export const CloudGuideSchema = z.object({
  completed: z.array(z.enum(CloudGuideSteps.map((s) => s.id))),
  hasPeers: z.boolean(),
});
export type CloudGuideStepId = (typeof CloudGuideSteps)[number]["id"];
