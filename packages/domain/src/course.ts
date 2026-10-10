import type { Assignment, Enrollment, Submission } from "@colorverse/contracts";
import { DomainError } from "./index";
export function requireCourseRole(
  enrollment: Enrollment | null,
  roles: Enrollment["role"][],
) {
  if (
    !enrollment ||
    enrollment.status !== "active" ||
    !roles.includes(enrollment.role)
  )
    throw new DomainError("FORBIDDEN", "你没有这项课程操作的权限");
  return enrollment;
}
export function submissionTiming(
  assignment: Assignment,
  state: Submission["state"],
  now: string,
) {
  if (assignment.status !== "published")
    throw new DomainError("FORBIDDEN", "这项作业尚未开放或已关闭");
  if (state === "graded" && !assignment.allowResubmission)
    throw new DomainError("FORBIDDEN", "已批改作业需要老师退回后才能重新提交");
  const isLate = Date.parse(now) > Date.parse(assignment.dueAt);
  if (
    isLate &&
    (!assignment.lateUntil ||
      Date.parse(now) > Date.parse(assignment.lateUntil))
  )
    throw new DomainError("FORBIDDEN", "已超过允许提交的截止时间");
  return { isLate, dueAtSnapshot: new Date(assignment.dueAt).toISOString() };
}
export function requireRevision(actual: number, expected: number) {
  if (actual !== expected)
    throw new DomainError(
      "REVISION_CONFLICT",
      "作业已更新，请重新载入后再操作",
    );
}
// Interpret the teacher's wall-clock input in the class IANA zone, rejecting
// missing and repeated DST times rather than silently choosing a different deadline.
export function classDeadlineToUtc(local: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new DomainError("VALIDATION_FAILED", "请选择有效的截止时间");
  const candidate = Date.parse(local + ":00Z");
  if (!Number.isFinite(candidate))
    throw new DomainError("VALIDATION_FAILED", "截止时间无效");
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new DomainError("VALIDATION_FAILED", "班级时区无效");
  }
  const parts = (time: number) =>
    Object.fromEntries(
      format.formatToParts(new Date(time)).map((p) => [p.type, p.value]),
    );
  const text = (time: number) => {
    const p = parts(time);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  const matches = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const probe = candidate + h * 3600000,
      p = parts(probe);
    const offset =
      Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - probe;
    const time = candidate - offset;
    if (text(time) === local) matches.add(time);
  }
  if (matches.size !== 1)
    throw new DomainError(
      "VALIDATION_FAILED",
      "该时间在班级时区中不存在或重复，请选择另一个时间",
    );
  return new Date([...matches][0]).toISOString();
}
