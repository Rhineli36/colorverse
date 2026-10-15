import { z } from "zod";
export { default as LearningContent } from "./learning-content.json";
export const LearningTaskIds = ["T01", "T02", "T03"] as const;
export const MoodChoices = [
  "宁静",
  "活跃",
  "温暖",
  "清凉",
  "神秘",
  "轻盈",
  "厚重",
  "紧张",
  "孤独",
  "亲切",
  "庄重",
  "怀旧",
] as const;
export const LearningIntentSchema = z.strictObject({
  referenceCaseId: z.string().max(80).optional(),
  intendedMoods: z.array(z.enum(MoodChoices)).max(3).default([]),
  customMood: z.string().trim().max(30).default(""),
  paletteColors: z
    .array(z.string().regex(/^#[a-f\d]{6}$/i))
    .max(8)
    .default([]),
  colorRationale: z.string().trim().max(1000).default(""),
});
export const LearningPolicySchema = z.strictObject({
  requireExplanation: z.boolean(),
  allowPeerReview: z.boolean(),
  showIntentToPeers: z.boolean(),
});
export const LearningTaskSettingSchema = LearningPolicySchema.extend({
  taskId: z.enum(LearningTaskIds),
  published: z.boolean(),
  revision: z.number().int().nonnegative(),
});
export const WorkLearningInput = LearningIntentSchema.extend({
  taskId: z.enum(LearningTaskIds).nullable().default(null),
  comparisonGroupId: z.uuid().nullable().default(null),
  variantLabel: z.string().trim().max(40).default(""),
});
export const WorkLearningSchema = WorkLearningInput.extend({
  policy: LearningPolicySchema,
  intentHidden: z.boolean().optional(),
});
export const PeerObservationSchema = z
  .strictObject({
    perceivedMoods: z.array(z.enum(MoodChoices)).max(3).default([]),
    customMood: z.string().trim().max(30).default(""),
    visualEvidence: z.string().trim().min(1).max(1000),
    suggestion: z.string().trim().max(1000).default(""),
  })
  .refine(
    (v) => v.perceivedMoods.length > 0 || Boolean(v.customMood),
    "请说明观察感受",
  );
export type LearningIntent = z.infer<typeof LearningIntentSchema>;
export type WorkLearning = z.infer<typeof WorkLearningInput>;
export type LearningTaskSetting = z.infer<typeof LearningTaskSettingSchema>;
export type PeerObservation = z.infer<typeof PeerObservationSchema>;
