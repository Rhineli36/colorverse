import { z } from "zod";
const uuid = z.uuid();
export const AssignmentInputSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160),
    instructions: z.string().trim().max(6000),
    module: z.string().trim().min(1).max(80),
    dueAt: z.iso.datetime({ offset: true }),
    lateUntil: z.iso.datetime({ offset: true }).nullable(),
    maxScore: z.number().finite().positive().max(1000),
    status: z.enum(["draft", "published", "closed"]),
    allowResubmission: z.boolean(),
  })
  .refine(
    (v) => !v.lateUntil || Date.parse(v.lateUntil) >= Date.parse(v.dueAt),
    {
      message: "补交截止时间不能早于正常截止时间",
    },
  );
export const SubmissionDraftSchema = z
  .strictObject({
    description: z.string().trim().max(6000),
    colorTags: z.array(z.string().trim().min(1).max(32)).max(8),
    assets: z
      .array(
        z.strictObject({ assetId: uuid, role: z.enum(["final", "process"]) }),
      )
      .max(3),
  })
  .refine(
    (v) => new Set(v.assets.map((a) => a.assetId)).size === v.assets.length,
    {
      message: "同一份作业中不能重复添加图片",
    },
  );
export const ReviewInputSchema = z
  .strictObject({
    expectedRevision: z.number().int().nonnegative(),
    decision: z.enum(["graded", "returned"]),
    score: z.number().finite().nonnegative().nullable(),
    comment: z.string().trim().max(6000),
  })
  .refine(
    (v) => (v.decision === "graded" ? v.score !== null : v.score === null),
    {
      message: "批改需要分数；退回不记分数",
    },
  );
export type AssignmentInput = z.infer<typeof AssignmentInputSchema>;
export interface Assignment extends AssignmentInput {
  id: string;
  classId: string;
  revision: number;
}
export interface CourseUser {
  id: string;
  displayName: string;
}
export interface Enrollment {
  id: string;
  classId: string;
  userId: string;
  role: "student" | "teacher" | "assistant";
  status: "active" | "inactive";
}
export interface CourseClass {
  id: string;
  title: string;
  timezone: string;
  role: Enrollment["role"];
}
export type SubmissionDraft = z.infer<typeof SubmissionDraftSchema>;
export interface CourseAsset {
  id: string;
  ownerUserId: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  status: "pending" | "ready" | "quarantined";
  storageKey: string;
}
export interface Submission {
  id: string;
  assignmentId: string;
  classId: string;
  enrollmentId: string;
  state: "draft" | "submitted" | "graded" | "returned";
  draft: SubmissionDraft;
  currentVersionId: string | null;
  revision: number;
}
export interface SubmissionVersion {
  id: string;
  submissionId: string;
  versionNo: number;
  description: string;
  colorTags: string[];
  submittedAt: string;
  dueAtSnapshot: string;
  isLate: boolean;
  contentHash: string;
  assets: Array<{
    assetId: string;
    role: "final" | "process";
    ordinal: number;
    sha256: string;
  }>;
}
export interface CourseReview {
  id: string;
  submissionVersionId: string;
  reviewerEnrollmentId: string;
  decision: "graded" | "returned";
  score: number | null;
  comment: string;
  supersedesId: string | null;
  createdAt: string;
}
export interface SubmissionReceipt {
  submission: Submission;
  version: SubmissionVersion;
  archiveEntryId: string;
}
export interface SubmissionDetail {
  submission: Submission;
  versions: SubmissionVersion[];
  reviews: CourseReview[];
}
export interface SubmissionSummary {
  id: string;
  studentName: string;
  state: Submission["state"];
  revision: number;
  currentVersionId: string | null;
  submittedAt: string | null;
  isLate: boolean | null;
}
