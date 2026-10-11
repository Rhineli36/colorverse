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
