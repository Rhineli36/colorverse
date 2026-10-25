import { z } from "zod";
export const ClassroomStudentSchema = z.strictObject({
  enrollment_id: z.uuid(),
  display_name: z.string(),
  account_status: z.enum(["active", "inactive"]),
  enrollment_status: z.enum(["active", "inactive"]),
  planet_id: z.uuid().nullable(),
  planet_name: z.string().nullable(),
  showcase_count: z.number().int().nonnegative(),
  weekly_showcase_count: z.number().int().nonnegative(),
  course_submission_count: z.number().int().nonnegative(),
  sent_count: z.number().int().nonnegative(),
  weekly_sent_count: z.number().int().nonnegative(),
  received_count: z.number().int().nonnegative(),
  weekly_received_count: z.number().int().nonnegative(),
  last_submission: z.string().nullable(),
  reviewed_showcase_count: z.number().int().nonnegative().default(0),
  suggested_review_count: z.number().int().nonnegative().default(0),
  average_showcase_score: z.number().min(0).max(100).nullable().default(null),
});
export const ClassroomOverviewSchema = z.strictObject({
  classId: z.uuid(),
  title: z.string(),
  timezone: z.string(),
  generatedAt: z.string(),
  students: z.array(ClassroomStudentSchema),
});
export type ClassroomOverview = z.infer<typeof ClassroomOverviewSchema>;
export type ClassroomStudent = z.infer<typeof ClassroomStudentSchema>;
export const ShowcaseReviewInput = z
  .strictObject({
    score: z.number().min(0).max(100).nullable(),
    comment: z.string().trim().max(2000),
    revision: z.number().int().nonnegative(),
    submissionRevision: z.number().int().nonnegative().optional(),
    requestId: z.uuid(),
  })
  .refine((v) => v.score !== null || v.comment.length > 0);
export const ShowcaseReviewResponse = z.strictObject({
  submissionRevision: z.number().int().nonnegative().optional(),
  latestRevision: z.number().int().nonnegative().optional(),
  history: z
    .array(
      z.object({
        revision: z.number(),
        score: z.number().nullable(),
        comment: z.string(),
        created_at: z.string(),
        submissionRevision: z.number().int().nonnegative().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .optional(),
  review: z
    .strictObject({
      id: z.uuid(),
      revision: z.number().int().positive(),
      score: z.number().min(0).max(100).nullable(),
      comment: z.string(),
      source: z.enum(["teacher", "demo"]),
      created_at: z.string(),
      reviewer_name: z.string(),
    })
    .nullable(),
});
