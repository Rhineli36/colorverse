// Maintainer CLI only. No web endpoint and no classroom reset operation.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { connectDatabase, readDatabaseConfig } from "./supabase-database.mjs";
if (!process.argv.includes("--restore-judges"))
  throw Error("USE_EXPLICIT_RESTORE_JUDGES_FLAG");
const path = "work/judges-accounts.json",
  j = JSON.parse(await readFile(path, "utf8"));
if (j.marker !== "colorverse-judges-2026-10-18" || j.accounts.length !== 4)
  throw Error("INVALID_REVIEW_JOURNAL");
const next = structuredClone(j);
next.classId = randomUUID();
next.previousClasses = [...(j.previousClasses ?? []), j.classId];
for (const a of next.accounts) {
  a.enrollmentId = randomUUID();
  a.groupId = randomUUID();
  a.uploads = [];
  delete a.planetId;
  delete a.appearanceSaved;
  delete a.media;
  delete a.feedbackSaved;
  delete a.feedbackRequestId;
}
const db = await connectDatabase(await readDatabaseConfig());
try {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(7301947)");
  const c = (
    await db.query(
      "SELECT title,course_id FROM colorverse.classes WHERE id=$1 FOR UPDATE",
      [j.classId],
    )
  ).rows[0];
  if (
    c?.course_id !== j.courseId ||
    c.title !== "色彩星球 · 评审体验班（演示内容）"
  )
    throw Error("NOT_MANAGED_REVIEW_CLASS");
  const members = (
    await db.query(
      "SELECT e.user_id,e.role,EXISTS(SELECT 1 FROM colorverse.student_accounts a WHERE a.user_id=e.user_id AND a.course_id=$2) AS imported_student FROM colorverse.enrollments e WHERE e.class_id=$1",
      [j.classId, j.courseId],
    )
  ).rows;
  if (
    j.accounts.some(
      (a) => !members.some((m) => m.user_id === a.userId && m.role === a.role),
    ) ||
    members.some(
      (m) =>
        !j.accounts.some((a) => a.userId === m.user_id && a.role === m.role) &&
        !(m.role === "student" && m.imported_student),
    )
  )
    throw Error("UNEXPECTED_REVIEW_MEMBERSHIP");
  await writeFile(
    `work/judges-backup-${j.classId}.json`,
    JSON.stringify(j, null, 2),
    { flag: "wx" },
  ).catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
  await db.query(
    "UPDATE colorverse.classes SET archived_at=now() WHERE id=$1",
    [j.classId],
  );
  await db.query(
    "UPDATE colorverse.enrollments SET status='inactive' WHERE class_id=$1",
    [j.classId],
  );
  await db.query(
    "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'色彩星球 · 评审体验班（演示内容）','2026 演示','Asia/Shanghai')",
    [next.classId, j.courseId],
  );
  for (const a of next.accounts) {
    await db.query(
      "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,$4)",
      [a.enrollmentId, next.classId, a.userId, a.role],
    );
    await db.query(
      "UPDATE colorverse.users SET real_name=NULL,student_number=NULL,display_name=$2 WHERE id=$1",
      [a.userId, a.name],
    );
  }
  await writeFile(
    "work/judges-restore-pending.json",
    JSON.stringify(next, null, 2),
  );
  await db.query("COMMIT");
  await writeFile(path, JSON.stringify(next, null, 2));
  console.log(
    "Review class restored. Existing review history archived; classroom rows and files untouched. Run judges-demo --seed next.",
  );
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally {
  await db.end();
}
