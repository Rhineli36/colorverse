import { z } from "zod";

export const CloudPlanetPresets = [
  { name: "流焰星", color: "#efa568" },
  { name: "翡翠星", color: "#82c9ae" },
  { name: "潮汐星", color: "#5a9dde" },
  { name: "紫雾星", color: "#b397d4" },
  { name: "霜蓝星", color: "#92c7df" },
  { name: "月岩星", color: "#c5bdaa" },
] as const;

export const CloudPlanetAppearanceInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[a-f0-9]{6}$/i),
  skin: z.number().int().min(0).max(5).default(0),
  summary: z.string().trim().max(1000).optional(),
  atmosphere: z.enum(["none", "stardust", "fireflies"]).optional(),
  halo: z.enum(["none", "soft", "ring"]).optional(),
  brightness: z.number().min(0.5).max(1.5).optional(),
  saturation: z.number().min(0).max(2).optional(),
  practice: z.literal("tone").optional(),
});
export const CloudPlanetDocumentSchema = z.object({
  metadata: z.object({ name: z.string(), summary: z.string().default("") }),
  color: z.string().default("#82c9c7"),
  skin: z.number().int().min(0).max(5).default(0),
  revision: z.number().int().nonnegative().default(0),
  atmosphere: z.enum(["none", "stardust", "fireflies"]).default("none"),
  halo: z.enum(["none", "soft", "ring"]).default("none"),
  brightness: z.number().min(0.5).max(1.5).default(1),
  saturation: z.number().min(0).max(2).default(1),
  media: z
    .object({
      exterior: z.object({ id: z.uuid() }).optional(),
      interior: z.object({ id: z.uuid() }).optional(),
    })
    .default({}),
});

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
    detail: "为星球选择星尘或萤火，让空间有一点生命力。",
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
