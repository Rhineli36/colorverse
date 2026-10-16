import LearningContent from "./learning-content.json";
import { z } from "zod";
export const LearningTaskIdSchema = z.union([
  z.enum(["T01", "T02", "T03"]),
  z.string().regex(/^custom-[a-f0-9-]{36}$/),
]);
export const CustomAssignmentFields = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  steps: z.array(z.string().trim().min(1).max(500)).max(10),
  deliverables: z.string().trim().min(1).max(2000),
  inspiration: z.string().trim().max(500).default(""),
  exampleObservation: z.string().trim().max(2000).default(""),
});
export const AssignmentDefinitionSchema = CustomAssignmentFields.extend({
  id: LearningTaskIdSchema,
  image: z.string().max(2000000).default(""),
  imageAlt: z.string().max(300).default("作业示范图片"),
  goal: z.string().default(""),
  reviewFocus: z.string().default(""),
  peerPrompt: z.string().default(""),
  relatedIds: z.array(z.string()).max(10).default([]),
});
export type AssignmentDefinition = z.infer<typeof AssignmentDefinitionSchema>;
export type CustomAssignmentDraft = z.infer<typeof CustomAssignmentFields>;
export const AssignmentCatalog = LearningContent.tasks;
export type AssignmentPublication = {
  id: string;
  taskId: string;
  publishedAt: string;
};
export type ClassroomNotification = {
  id: string;
  kind: "assignment" | "like" | "emoji" | "comment";
  title: string;
  createdAt: string;
  taskId?: string;
  assignment?: AssignmentDefinition;
  planetId?: string;
  workId?: string | null;
  content?: string;
};
