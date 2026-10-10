import {
  SubmissionDraftSchema,
  ReviewInputSchema,
  AssignmentInputSchema,
  type Assignment,
  type AssignmentInput,
  type Enrollment,
  type Submission,
  type SubmissionDraft,
  type CourseAsset,
  type SubmissionVersion,
  type CourseReview,
  type SubmissionReceipt,
} from "@colorverse/contracts";
import {
  requireCourseRole,
  requireRevision,
  submissionTiming,
  DomainError,
} from "@colorverse/domain";

export interface CourseTransaction {
  enrollment(userId: string, classId: string): Promise<Enrollment | null>;
  assignment(id: string, lock?: boolean): Promise<Assignment>;
  submission(id: string): Promise<Submission>;
  createSubmission(
    assignment: Assignment,
    enrollment: Enrollment,
    id: string,
  ): Promise<Submission>;
  saveSubmission(submission: Submission): Promise<void>;
  assets(ids: string[]): Promise<CourseAsset[]>;
  versions(submissionId: string): Promise<SubmissionVersion[]>;
  appendVersion(version: SubmissionVersion): Promise<void>;
  appendArchive(
    id: string,
    version: SubmissionVersion,
    enrollment: Enrollment,
  ): Promise<void>;
  replay(
    userId: string,
    operation: string,
    key: string,
  ): Promise<{ requestHash: string; response: SubmissionReceipt } | null>;
  remember(
    userId: string,
    key: string,
    hash: string,
    response: SubmissionReceipt,
  ): Promise<void>;
  lastReview(versionId: string): Promise<CourseReview | null>;
  appendReview(review: CourseReview): Promise<void>;
  createAssignment(
    id: string,
    classId: string,
    input: AssignmentInput,
  ): Promise<Assignment>;
}
export interface CourseUnitOfWork {
  run<T>(fn: (tx: CourseTransaction) => Promise<T>): Promise<T>;
}
export class SubmissionService {
  constructor(
    private uow: CourseUnitOfWork,
    private hash: (text: string) => string,
    private now = () => new Date().toISOString(),
    private uuid = () => crypto.randomUUID(),
  ) {}
  private async owned(tx: CourseTransaction, userId: string, sub: Submission) {
    const enrollment = requireCourseRole(
      await tx.enrollment(userId, sub.classId),
      ["student"],
    );
    if (enrollment.id !== sub.enrollmentId)
      throw new DomainError("FORBIDDEN", "只能修改自己的作业");
    return enrollment;
  }
  open(userId: string, assignmentId: string) {
    return this.uow.run(async (tx) => {
      const assignment = await tx.assignment(assignmentId);
      const enrollment = requireCourseRole(
        await tx.enrollment(userId, assignment.classId),
        ["student"],
      );
      if (assignment.status === "draft")
        throw new DomainError("NOT_FOUND", "作业不存在或尚未发布");
      return tx.createSubmission(assignment, enrollment, this.uuid());
    });
  }
  saveDraft(
    userId: string,
    id: string,
    expectedRevision: number,
    input: unknown,
  ) {
    const draft = SubmissionDraftSchema.parse(input);
    return this.uow.run(async (tx) => {
      const sub = await tx.submission(id);
      await this.owned(tx, userId, sub);
      requireRevision(sub.revision, expectedRevision);
      await this.readyAssets(tx, userId, draft);
      sub.draft = draft;
      sub.revision++;
      await tx.saveSubmission(sub);
      return sub;
    });
  }
  private async readyAssets(
    tx: CourseTransaction,
    userId: string,
    draft: SubmissionDraft,
  ) {
    const assets = await tx.assets(draft.assets.map((a) => a.assetId));
    if (
      assets.length !== draft.assets.length ||
      assets.some((a) => a.ownerUserId !== userId || a.status !== "ready")
    )
      throw new DomainError("FORBIDDEN", "图片未上传完成或不属于你");
    return assets;
  }
  submit(userId: string, id: string, expectedRevision: number, key: string) {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key))
      throw new DomainError("VALIDATION_FAILED", "缺少有效的提交请求标识");
    const requestHash = this.hash(JSON.stringify({ id, expectedRevision }));
    return this.uow.run(async (tx) => {
      const sub = await tx.submission(id),
        enrollment = await this.owned(tx, userId, sub);
      const replay = await tx.replay(userId, "submit", key);
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw new DomainError(
            "REVISION_CONFLICT",
            "同一提交请求标识不能用于不同内容",
          );
        return replay.response;
      }
      requireRevision(sub.revision, expectedRevision);
      const assignment = await tx.assignment(sub.assignmentId, true),
        now = this.now();
      const timing = submissionTiming(assignment, sub.state, now);
      if (!sub.draft.assets.some((a) => a.role === "final"))
        throw new DomainError(
          "VALIDATION_FAILED",
          "请至少添加一张最终作品图片",
        );
      const ready = await this.readyAssets(tx, userId, sub.draft),
        previous = await tx.versions(sub.id);
      const snapshot = {
        description: sub.draft.description,
        colorTags: [...sub.draft.colorTags],
        assets: sub.draft.assets.map((a, ordinal) => ({
          ...a,
          ordinal,
          sha256: ready.find((r) => r.id === a.assetId)!.sha256,
        })),
      };
      const version: SubmissionVersion = {
        ...snapshot,
        id: this.uuid(),
        submissionId: sub.id,
        versionNo: previous.length + 1,
        submittedAt: now,
        ...timing,
        contentHash: this.hash(JSON.stringify(snapshot)),
      };
      const archiveEntryId = this.uuid();
      await tx.appendVersion(version);
      await tx.appendArchive(archiveEntryId, version, enrollment);
      sub.state = "submitted";
      sub.currentVersionId = version.id;
      sub.revision++;
      await tx.saveSubmission(sub);
      const response = { submission: sub, version, archiveEntryId };
      await tx.remember(userId, key, requestHash, response);
      return response;
    });
  }
  review(
    userId: string,
    submissionId: string,
    versionId: string,
    input: unknown,
  ) {
    const review = ReviewInputSchema.parse(input);
    return this.uow.run(async (tx) => {
      const sub = await tx.submission(submissionId),
        enrollment = requireCourseRole(
          await tx.enrollment(userId, sub.classId),
          ["teacher"],
        );
      requireRevision(sub.revision, review.expectedRevision);
      const versions = await tx.versions(sub.id);
      if (!versions.some((v) => v.id === versionId))
        throw new DomainError("NOT_FOUND", "提交版本不存在");
      const assignment = await tx.assignment(sub.assignmentId);
      if (review.score !== null && review.score > assignment.maxScore)
        throw new DomainError("VALIDATION_FAILED", "分数不能超过作业满分");
      const previous = await tx.lastReview(versionId);
      const result: CourseReview = {
        id: this.uuid(),
        submissionVersionId: versionId,
        reviewerEnrollmentId: enrollment.id,
        decision: review.decision,
        score: review.score,
        comment: review.comment,
        supersedesId: previous?.id ?? null,
        createdAt: this.now(),
      };
      await tx.appendReview(result);
      if (sub.currentVersionId === versionId) sub.state = review.decision;
      sub.revision++;
      await tx.saveSubmission(sub);
      return { submission: sub, review: result };
    });
  }
  createAssignment(userId: string, classId: string, input: unknown) {
    const assignment = AssignmentInputSchema.parse(input);
    return this.uow.run(async (tx) => {
      requireCourseRole(await tx.enrollment(userId, classId), ["teacher"]);
      return tx.createAssignment(this.uuid(), classId, assignment);
    });
  }
}
