// Read only: export the existing managed demo accounts, never the real classroom roster.
import { readFile, writeFile } from "node:fs/promises";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";
const file = "apps/web/public/competition/manifest.json";
let db;
try {
  const j = JSON.parse(await readFile("work/demo-accounts.json", "utf8")),
    snapshot = JSON.parse(await readFile(file, "utf8"));
  if (
    j.marker !== "colorverse-class-demo-2026-10-14" ||
    j.students.length !== 5
  )
    throw new Error("MANAGED_DEMO_REQUIRED");
  const ids = j.students.flatMap((s) => s.works.map((w) => w.id)),
    actors = j.students.map((s) => s.enrollmentId);
  db = await connectDatabase(await readDatabaseConfig());
  const works = (
    await db.query(
      "SELECT w.id,w.title,w.description,w.created_at,w.element_params FROM colorverse.showcase_works w JOIN colorverse.planets p ON p.id=w.planet_id JOIN colorverse.enrollments e ON e.id=p.owner_enrollment_id WHERE w.id=ANY($1::uuid[]) AND p.owner_enrollment_id=ANY($2::uuid[]) AND e.class_id=$3",
      [ids, actors, j.classId],
    )
  ).rows;
  if (works.length !== 25) throw new Error("DEMO_WORKS_MISMATCH");
  const responses = (
    await db.query(
      "SELECT work_id,actor_enrollment_id,kind,content FROM colorverse.classroom_interactions WHERE work_id=ANY($1::uuid[]) AND actor_enrollment_id=ANY($2::uuid[]) ORDER BY created_at",
      [ids, actors],
    )
  ).rows;
  for (const [i, s] of snapshot.students.entries())
    for (const [k, w] of s.works.entries()) {
      const id = j.students[i].works[k].id,
        row = works.find((r) => r.id === id);
      if (!row) throw new Error("WORK_NOT_MANAGED");
      w.params = row.element_params;
      w.createdAt = row.created_at.toISOString();
      w.description =
        "往届《设计色彩》作业预览，仅供展示。预置配色说明与点评示例不代表原作者意图或原课程成绩。";
      w.interactions = responses
        .filter((r) => r.work_id === id)
        .map((r) => ({
          kind: r.kind,
          content: r.content,
          author: `演示学生 0${actors.indexOf(r.actor_enrollment_id) + 1}`,
        }));
    }
  await writeFile(file, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: "read_only_demo_snapshot_refreshed",
      works: works.length,
      workInteractions: responses.length,
      realRosterExported: false,
    }),
  );
} catch {
  console.error("Snapshot refresh failed; private data was not printed.");
  process.exitCode = 1;
} finally {
  await db?.end();
}
