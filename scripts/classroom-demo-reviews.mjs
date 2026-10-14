import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";

// Only new managed demo works are eligible. Never overwrite a teacher confirmation.
let db;
try {
  const journal = JSON.parse(await readFile("work/demo-accounts.json", "utf8"));
  const suggestions = z
    .array(
      z
        .array(
          z.strictObject({
            score: z.number().min(0).max(100),
            comment: z.string().trim().min(1).max(2000),
          }),
        )
        .length(5),
    )
    .length(5)
    .parse(
      JSON.parse(await readFile("work/demo-materials/reviews.json", "utf8")),
    );
  if (
    journal.marker !== "colorverse-class-demo-2026-10-14" ||
    journal.students.length !== 5 ||
    !journal.seededAt
  )
    throw new Error("COMPLETE_DEMO_IMPORT_REQUIRED");
  for (const student of journal.students)
    for (const work of student.works) work.reviewRequestId ??= randomUUID();
  await writeFile(
    "work/demo-accounts.json",
    JSON.stringify(journal, null, 2) + "\n",
    { mode: 0o600 },
  );
  const config = await readDatabaseConfig();
  db = await connectDatabase(config);
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(7301944)");
  const teacher = await db.query(
    "SELECT e.id FROM colorverse.enrollments e JOIN colorverse.users u ON u.id=e.user_id JOIN colorverse.classes c ON c.id=e.class_id WHERE e.class_id=$1 AND e.role='teacher' AND e.status='active' AND u.status='active' AND c.archived_at IS NULL AND u.auth_subject=(SELECT id::text FROM auth.users WHERE email='2999346@qq.com')",
    [journal.classId],
  );
  if (teacher.rows.length !== 1)
    throw new Error("VERIFIED_DEMO_CLASS_TEACHER_REQUIRED");
  let inserted = 0,
    preserved = 0;
  for (const [i, student] of journal.students.entries()) {
    if (student.works.length !== 5)
      throw new Error("FIVE_MANAGED_WORKS_REQUIRED");
    for (const [j, work] of student.works.entries()) {
      const owned = await db.query(
        "SELECT w.id FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id JOIN colorverse.users u ON u.id=e.user_id WHERE w.id=$1 AND p.id=$2 AND e.id=$3 AND e.class_id=$4 AND u.auth_subject=$5 AND e.role='student' AND e.status='active' AND w.withdrawn_at IS NULL FOR UPDATE OF w",
        [
          work.id,
          student.planetId,
          student.enrollmentId,
          journal.classId,
          student.authId,
        ],
      );
      if (owned.rows.length !== 1)
        throw new Error("MANAGED_DEMO_WORK_REQUIRED");
      const existing = await db.query(
        "SELECT id FROM colorverse.showcase_reviews WHERE work_id=$1",
        [work.id],
      );
      if (existing.rows.length) {
        preserved++;
        continue;
      }
      const suggestion = suggestions[i][j];
      await db.query(
        "INSERT INTO colorverse.showcase_reviews(id,work_id,reviewer_enrollment_id,revision,base_revision,score,comment,source,request_id) VALUES($1,$2,$3,1,0,$4,$5,'demo',$6)",
        [
          randomUUID(),
          work.id,
          teacher.rows[0].id,
          suggestion.score,
          suggestion.comment,
          work.reviewRequestId,
        ],
      );
      inserted++;
    }
  }
  await db.query("COMMIT");
  const report = {
    status: "demo_suggestions_ready",
    inserted,
    preserved,
    scale: 100,
    confirmedTeacherGrades: false,
  };
  await writeFile(
    "outputs/classroom-demo-reviews.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  await db?.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      status: "failed",
      code: /^[A-Z0-9_]{1,80}$/.test(error.message ?? "")
        ? error.message
        : "DEMO_REVIEW_SETUP_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await db?.end();
}
