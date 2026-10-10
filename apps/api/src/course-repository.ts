import type {
  Assignment,
  AssignmentInput,
  Enrollment,
  Submission,
  SubmissionVersion,
  CourseAsset,
  CourseReview,
  SubmissionReceipt,
  SubmissionDetail,
  CourseUser,
  CourseClass,
  SubmissionSummary,
} from "@colorverse/contracts";
import type {
  CourseTransaction,
  CourseUnitOfWork,
} from "@colorverse/application";
import { requireCourseRole, DomainError } from "@colorverse/domain";
import type { CourseDatabase, SqlConnection, Row } from "./database";
const iso = (value: unknown) =>
  (value instanceof Date ? value : new Date(String(value))).toISOString();
const assignment = (r: Row): Assignment => ({
  id: String(r.id),
  classId: String(r.class_id),
  title: String(r.title),
  instructions: String(r.instructions),
  module: String(r.module),
  dueAt: iso(r.due_at),
  lateUntil: r.late_until ? iso(r.late_until) : null,
  maxScore: Number(r.max_score),
  status: r.status as Assignment["status"],
  allowResubmission: Boolean(r.allow_resubmission),
  revision: Number(r.revision),
});
const submission = (r: Row): Submission => ({
  id: String(r.id),
  assignmentId: String(r.assignment_id),
  classId: String(r.class_id),
  enrollmentId: String(r.enrollment_id),
  state: r.state as Submission["state"],
  draft: r.draft as Submission["draft"],
  currentVersionId: r.current_version_id ? String(r.current_version_id) : null,
  revision: Number(r.revision),
});
const review = (r: Row): CourseReview => ({
  id: String(r.id),
  submissionVersionId: String(r.submission_version_id),
  reviewerEnrollmentId: String(r.reviewer_enrollment_id),
  decision: r.decision as CourseReview["decision"],
  score: r.score === null ? null : Number(r.score),
  comment: String(r.comment),
  supersedesId: r.supersedes_id ? String(r.supersedes_id) : null,
  createdAt: iso(r.created_at),
});
const asset = (r: Row): CourseAsset => ({
  id: String(r.id),
  ownerUserId: String(r.owner_user_id),
  sha256: String(r.sha256),
  mimeType: String(r.mime_type),
  byteSize: Number(r.byte_size),
  width: Number(r.width),
  height: Number(r.height),
  status: r.status as CourseAsset["status"],
  storageKey: String(r.storage_key),
});
export const withoutDraft = (sub: Submission): Submission => ({
  ...sub,
  draft: { description: "", colorTags: [], assets: [] },
});
class Transaction implements CourseTransaction {
  constructor(public sql: SqlConnection) {}
  async enrollment(
    userId: string,
    classId: string,
  ): Promise<Enrollment | null> {
    const { rows } = await this.sql.query(
      "SELECT e.* FROM enrollments e JOIN users u ON u.id=e.user_id JOIN classes c ON c.id=e.class_id WHERE e.user_id=$1 AND e.class_id=$2 AND u.status='active' AND c.archived_at IS NULL FOR SHARE OF e,u,c",
      [userId, classId],
    );
    const r = rows[0];
    return r
      ? {
          id: String(r.id),
          classId: String(r.class_id),
          userId: String(r.user_id),
          role: r.role as Enrollment["role"],
          status: r.status as Enrollment["status"],
        }
      : null;
  }
  async assignment(id: string, lock = false) {
    const { rows } = await this.sql.query(
      `SELECT * FROM assignments WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    if (!rows[0]) throw new DomainError("NOT_FOUND", "作业不存在");
    return assignment(rows[0]);
  }
  async submission(id: string) {
    const { rows } = await this.sql.query(
      "SELECT * FROM submissions WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!rows[0]) throw new DomainError("NOT_FOUND", "提交不存在");
    return submission(rows[0]);
  }
  async createSubmission(a: Assignment, e: Enrollment, id: string) {
    await this.sql.query(
      "INSERT INTO submissions(id,assignment_id,class_id,enrollment_id,draft) VALUES($1,$2,$3,$4,$5) ON CONFLICT(assignment_id,enrollment_id) DO NOTHING",
      [
        id,
        a.id,
        a.classId,
        e.id,
        JSON.stringify({ description: "", colorTags: [], assets: [] }),
      ],
    );
    const { rows } = await this.sql.query(
      "SELECT * FROM submissions WHERE assignment_id=$1 AND enrollment_id=$2 FOR UPDATE",
      [a.id, e.id],
    );
    return submission(rows[0]);
  }
  async saveSubmission(s: Submission) {
    await this.sql.query(
      "UPDATE submissions SET draft=$2,state=$3,current_version_id=$4,revision=$5 WHERE id=$1",
      [s.id, JSON.stringify(s.draft), s.state, s.currentVersionId, s.revision],
    );
  }
  async assets(ids: string[]) {
    if (!ids.length) return [];
    const { rows } = await this.sql.query(
      "SELECT * FROM assets WHERE id=ANY($1::uuid[]) FOR SHARE",
      [ids],
    );
    return rows.map(asset);
  }
  async versions(id: string) {
    const { rows } = await this.sql.query(
      "SELECT * FROM submission_versions WHERE submission_id=$1 ORDER BY version_no",
      [id],
    );
    const result: SubmissionVersion[] = [];
    for (const r of rows) {
      const media = await this.sql.query(
        "SELECT asset_id,role,ordinal,sha256 FROM submission_version_assets WHERE version_id=$1 ORDER BY ordinal",
        [r.id],
      );
      result.push({
        id: String(r.id),
        submissionId: String(r.submission_id),
        versionNo: Number(r.version_no),
        description: String(r.description),
        colorTags: r.color_tags as string[],
        submittedAt: iso(r.submitted_at),
        dueAtSnapshot: iso(r.due_at_snapshot),
        isLate: Boolean(r.is_late),
        contentHash: String(r.content_hash),
        assets: media.rows.map((a) => ({
          assetId: String(a.asset_id),
          role: a.role as "final" | "process",
          ordinal: Number(a.ordinal),
          sha256: String(a.sha256),
        })),
      });
    }
    return result;
  }
  async appendVersion(v: SubmissionVersion) {
    await this.sql.query(
      "INSERT INTO submission_versions(id,submission_id,version_no,description,color_tags,submitted_at,due_at_snapshot,is_late,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        v.id,
        v.submissionId,
        v.versionNo,
        v.description,
        JSON.stringify(v.colorTags),
        v.submittedAt,
        v.dueAtSnapshot,
        v.isLate,
        v.contentHash,
      ],
    );
    for (const a of v.assets)
      await this.sql.query(
        "INSERT INTO submission_version_assets(version_id,asset_id,role,ordinal,sha256) VALUES($1,$2,$3,$4,$5)",
        [v.id, a.assetId, a.role, a.ordinal, a.sha256],
      );
  }
  async appendArchive(id: string, v: SubmissionVersion, e: Enrollment) {
    const { rows } = await this.sql.query(
      "SELECT id FROM planets WHERE owner_enrollment_id=$1",
      [e.id],
    );
    if (!rows[0]) throw new DomainError("NOT_FOUND", "课程星球尚未分配");
    await this.sql.query(
      "INSERT INTO archive_entries(id,planet_id,submission_version_id) VALUES($1,$2,$3)",
      [id, rows[0].id, v.id],
    );
  }
  async replay(userId: string, operation: string, key: string) {
    const { rows } = await this.sql.query(
      "SELECT request_hash,response FROM idempotency_records WHERE actor_id=$1 AND operation=$2 AND key=$3",
      [userId, operation, key],
    );
    return rows[0]
      ? {
          requestHash: String(rows[0].request_hash),
          response: rows[0].response as SubmissionReceipt,
        }
      : null;
  }
  async remember(
    userId: string,
    key: string,
    hash: string,
    response: SubmissionReceipt,
  ) {
    await this.sql.query(
      "INSERT INTO idempotency_records(actor_id,operation,key,request_hash,response) VALUES($1,'submit',$2,$3,$4)",
      [userId, key, hash, JSON.stringify(response)],
    );
  }
  async lastReview(id: string) {
    const { rows } = await this.sql.query(
      "SELECT r.* FROM reviews r WHERE r.submission_version_id=$1 AND NOT EXISTS(SELECT 1 FROM reviews next WHERE next.supersedes_id=r.id) ORDER BY r.created_at DESC,r.id DESC LIMIT 1",
      [id],
    );
    return rows[0] ? review(rows[0]) : null;
  }
  async appendReview(r: CourseReview) {
    await this.sql.query(
      "INSERT INTO reviews(id,submission_version_id,reviewer_enrollment_id,decision,score,comment,supersedes_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        r.id,
        r.submissionVersionId,
        r.reviewerEnrollmentId,
        r.decision,
        r.score,
        r.comment,
        r.supersedesId,
        r.createdAt,
      ],
    );
  }
  async createAssignment(id: string, classId: string, a: AssignmentInput) {
    await this.sql.query(
      "INSERT INTO assignments(id,class_id,title,instructions,module,due_at,late_until,max_score,status,allow_resubmission) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        id,
        classId,
        a.title,
        a.instructions,
        a.module,
        a.dueAt,
        a.lateUntil,
        a.maxScore,
        a.status,
        a.allowResubmission,
      ],
    );
    return this.assignment(id);
  }
}
export class SqlCourseRepository implements CourseUnitOfWork {
  constructor(public db: CourseDatabase) {}
  run<T>(fn: (tx: CourseTransaction) => Promise<T>) {
    return this.db.transaction((sql) => fn(new Transaction(sql)));
  }
  async user(id: string): Promise<CourseUser> {
    const { rows } = await this.db.query(
      "SELECT id,display_name FROM users WHERE id=$1 AND status='active'",
      [id],
    );
    if (!rows[0]) throw new DomainError("FORBIDDEN", "账户当前不可用");
    return {
      id: String(rows[0].id),
      displayName: String(rows[0].display_name),
    };
  }
  async classes(userId: string): Promise<CourseClass[]> {
    const { rows } = await this.db.query(
      "SELECT c.*,e.role FROM classes c JOIN enrollments e ON c.id=e.class_id WHERE e.user_id=$1 AND e.status='active' AND c.archived_at IS NULL ORDER BY c.title",
      [userId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      timezone: String(r.timezone),
      role: r.role as Enrollment["role"],
    }));
  }
  async assignments(userId: string, classId: string) {
    const tx = new Transaction(this.db);
    const e = requireCourseRole(await tx.enrollment(userId, classId), [
      "student",
      "teacher",
      "assistant",
    ]);
    const { rows } = await this.db.query(
      "SELECT * FROM assignments WHERE class_id=$1 AND ($2::boolean OR status<>'draft') ORDER BY due_at,id",
      [classId, e.role === "teacher"],
    );
    return rows.map(assignment);
  }
  async detail(userId: string, id: string): Promise<SubmissionDetail> {
    return this.db.transaction(async (sql) => {
      const tx = new Transaction(sql),
        s = await tx.submission(id);
      const e = requireCourseRole(await tx.enrollment(userId, s.classId), [
        "student",
        "teacher",
      ]);
      if (e.role === "student" && e.id !== s.enrollmentId)
        throw new DomainError("FORBIDDEN", "只能查看自己的作业");
      if (e.role === "teacher" && !s.currentVersionId)
        throw new DomainError("FORBIDDEN", "老师不能查看未提交的私人草稿");
      const reviews = await sql.query(
        "SELECT r.* FROM reviews r JOIN submission_versions v ON v.id=r.submission_version_id WHERE v.submission_id=$1 ORDER BY r.created_at,r.id",
        [id],
      );
      return {
        submission: e.role === "teacher" ? withoutDraft(s) : s,
        versions: await tx.versions(id),
        reviews: reviews.rows.map(review),
      };
    });
  }
  async summaries(userId: string, id: string): Promise<SubmissionSummary[]> {
    const tx = new Transaction(this.db),
      a = await tx.assignment(id);
    requireCourseRole(await tx.enrollment(userId, a.classId), ["teacher"]);
    const { rows } = await this.db.query(
      "SELECT s.id,s.state,s.revision,s.current_version_id,u.display_name,v.submitted_at,v.is_late FROM submissions s JOIN enrollments e ON e.id=s.enrollment_id JOIN users u ON u.id=e.user_id LEFT JOIN submission_versions v ON v.id=s.current_version_id WHERE s.assignment_id=$1 AND s.current_version_id IS NOT NULL ORDER BY v.submitted_at DESC",
      [id],
    );
    return rows.map((r) => ({
      id: String(r.id),
      studentName: String(r.display_name),
      state: r.state as Submission["state"],
      revision: Number(r.revision),
      currentVersionId: r.current_version_id
        ? String(r.current_version_id)
        : null,
      submittedAt: r.submitted_at ? iso(r.submitted_at) : null,
      isLate: r.is_late === null ? null : Boolean(r.is_late),
    }));
  }
  async authorizedAsset(userId: string, id: string) {
    const { rows } = await this.db.query(
      "SELECT a.* FROM assets a WHERE a.id=$2 AND a.status='ready' AND (a.owner_user_id=$1 OR EXISTS(SELECT 1 FROM submission_version_assets va JOIN submission_versions v ON v.id=va.version_id JOIN submissions s ON s.id=v.submission_id JOIN enrollments teacher ON teacher.class_id=s.class_id JOIN classes c ON c.id=s.class_id WHERE va.asset_id=a.id AND teacher.user_id=$1 AND teacher.role='teacher' AND teacher.status='active' AND c.archived_at IS NULL))",
      [userId, id],
    );
    if (!rows[0]) throw new DomainError("FORBIDDEN", "不能访问这张私人图片");
    return asset(rows[0]);
  }
}
