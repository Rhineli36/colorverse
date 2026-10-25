import { z } from "zod";
import { AssignmentDefinitionSchema } from "./classroom-mail";
export const PublicationInput = z.strictObject({
  requestId: z.uuid(),
  taskId: z.string().min(1).max(80),
  enrollmentIds: z.array(z.uuid()).max(1000),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
});
export const SubmissionRowSchema = z.object({
  enrollmentId: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  studentNumber: z.string(),
  planetId: z.uuid().nullable(),
  workId: z.uuid().nullable(),
  title: z.string().nullable(),
  submittedAt: z.string().nullable(),
  score: z.number().nullable(),
  comment: z.string(),
  reviewRevision: z.number(),
  status: z.enum(["missing", "pending", "reviewed"]),
  updated: z.boolean(),
});
export type SubmissionRow = z.infer<typeof SubmissionRowSchema>;
export const PublicationSchema = z.object({
  id: z.uuid(),
  taskId: z.string(),
  definition: AssignmentDefinitionSchema,
  targetLabel: z.string(),
  dueAt: z.string().nullable(),
  publishedAt: z.string(),
  expected: z.number(),
  submitted: z.number(),
  missing: z.number(),
  pending: z.number(),
  reviewed: z.number(),
});
export type Publication = z.infer<typeof PublicationSchema>;
export const RosterStudentSchema = z.object({
  enrollmentId: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  studentNumber: z.string(),
  planetId: z.uuid().nullable(),
  planetName: z.string().nullable(),
  loggedIn: z.boolean(),
  activated: z.boolean(),
  mustChangePassword: z.boolean(),
  expected: z.number(),
  submitted: z.number(),
  pending: z.number(),
});
export type RosterStudent = z.infer<typeof RosterStudentSchema>;
