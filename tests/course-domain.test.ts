import { describe, it, expect } from "vitest";
import {
  AssignmentInputSchema,
  SubmissionDraftSchema,
  ReviewInputSchema,
  type Assignment,
} from "@colorverse/contracts";
import {
  classDeadlineToUtc,
  requireCourseRole,
  submissionTiming,
} from "@colorverse/domain";
import { uid } from "@colorverse/fixtures";
const assignment: Assignment = {
  id: uid(1),
  classId: uid(2),
  title: "色彩作业",
  instructions: "",
  module: "色彩",
  dueAt: "2026-10-12T10:00:00Z",
  lateUntil: "2026-10-13T10:00:00Z",
  maxScore: 100,
  status: "published",
  allowResubmission: false,
  revision: 0,
};
describe("course contracts and decisions", () => {
  it("rejects duplicate images, invalid late windows and inconsistent review decisions", () => {
    expect(
      SubmissionDraftSchema.safeParse({
        description: "",
        colorTags: [],
        assets: [
          { assetId: uid(1), role: "final" },
          { assetId: uid(1), role: "process" },
        ],
      }).success,
    ).toBe(false);
    expect(
      AssignmentInputSchema.safeParse({
        ...assignment,
        id: undefined,
        classId: undefined,
        revision: undefined,
        lateUntil: "2026-10-11T10:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      ReviewInputSchema.safeParse({
        expectedRevision: 0,
        decision: "returned",
        score: 80,
        comment: "",
      }).success,
    ).toBe(false);
  });
  it("interprets class time rather than the machine timezone and rejects nonexistent/ambiguous DST times", () => {
    expect(classDeadlineToUtc("2026-10-12T18:00", "Asia/Shanghai")).toBe(
      "2026-10-12T10:00:00.000Z",
    );
    expect(classDeadlineToUtc("2026-07-12T18:00", "America/New_York")).toBe(
      "2026-07-12T22:00:00.000Z",
    );
    expect(() =>
      classDeadlineToUtc("2026-03-08T02:30", "America/New_York"),
    ).toThrow(/不存在或重复/);
    expect(() =>
      classDeadlineToUtc("2026-11-01T01:30", "America/New_York"),
    ).toThrow(/不存在或重复/);
    expect(() =>
      classDeadlineToUtc("2026-02-30T18:00", "Asia/Shanghai"),
    ).toThrow();
  });
  it("preserves the exact due-time boundary and enforces late and returned/graded policies", () => {
    expect(submissionTiming(assignment, "draft", assignment.dueAt).isLate).toBe(
      false,
    );
    expect(
      submissionTiming(assignment, "returned", "2026-10-12T10:00:00.001Z")
        .isLate,
    ).toBe(true);
    expect(() =>
      submissionTiming(assignment, "draft", "2026-10-13T10:00:00.001Z"),
    ).toThrow();
    expect(() =>
      submissionTiming(
        { ...assignment, status: "closed" },
        "draft",
        assignment.dueAt,
      ),
    ).toThrow();
    expect(() =>
      submissionTiming(assignment, "graded", assignment.dueAt),
    ).toThrow();
    expect(
      submissionTiming(
        { ...assignment, allowResubmission: true },
        "graded",
        assignment.dueAt,
      ).isLate,
    ).toBe(false);
  });
  it("requires active class membership and never grants teacher authority to an assistant by default", () => {
    expect(() => requireCourseRole(null, ["teacher"])).toThrow();
    expect(() =>
      requireCourseRole(
        {
          id: uid(1),
          classId: uid(2),
          userId: uid(3),
          role: "assistant",
          status: "active",
        },
        ["teacher"],
      ),
    ).toThrow();
    expect(() =>
      requireCourseRole(
        {
          id: uid(1),
          classId: uid(2),
          userId: uid(3),
          role: "student",
          status: "inactive",
        },
        ["student"],
      ),
    ).toThrow();
  });
});
