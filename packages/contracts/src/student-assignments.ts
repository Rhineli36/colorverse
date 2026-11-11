import { z } from "zod";
import { AssignmentDefinitionSchema } from "./classroom-mail";

export const StudentWorkSchema = z.object({
  id: z.uuid(),
  planetId: z.uuid(),
  publicationId: z.uuid().nullable(),
  taskId: z.string().nullable(),
  title: z.string(),
  submittedAt: z.string(),
  status: z.enum(["pending", "reviewed"]),
  updated: z.boolean(),
  withdrawn: z.boolean(),
  score: z.number().nullable(),
  comment: z.string(),
  submissionRevision: z.number().int().nonnegative(),
});
export type StudentWork = z.infer<typeof StudentWorkSchema>;
export const StudentAssignmentSchema = z.object({
  id: z.uuid(),
  taskId: z.string(),
  definition: AssignmentDefinitionSchema,
  dueAt: z.string().nullable(),
  publishedAt: z.string(),
  latestWorkId: z.uuid().nullable(),
});
export type StudentAssignment = z.infer<typeof StudentAssignmentSchema>;
export const StudentAssignmentsSchema = z.object({
  planetId: z.uuid().nullable(),
  assignments: z.array(StudentAssignmentSchema),
  works: z.array(StudentWorkSchema),
});
export type StudentAssignments = z.infer<typeof StudentAssignmentsSchema>;
