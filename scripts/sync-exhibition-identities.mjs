// Owner-requested attribution. Only the five managed demo accounts may be updated.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";
let db;
try {
  const j = JSON.parse(await readFile("work/demo-accounts.json", "utf8"));
  const sources = JSON.parse(
    await readFile("work/demo-materials/selected.json", "utf8"),
  );
  const snapshot = JSON.parse(
    await readFile("apps/web/public/competition/manifest.json", "utf8"),
  );
  if (
    j.marker !== "colorverse-class-demo-2026-10-14" ||
    j.students.length !== 5 ||
    sources.length !== 5
  )
    throw Error("MANAGED_DEMO_REQUIRED");
  const identities = sources.map((s) => ({
    realName: s.author,
    studentNumber: path.win32.basename(s.deck).match(/^(\d{8,14})(?=\s)/)?.[1],
  }));
  if (
    identities.some((p) => !p.realName || !p.studentNumber) ||
    new Set(identities.map((p) => p.studentNumber)).size !== 5
  )
    throw Error("SOURCE_IDENTITY_INCOMPLETE");
  db = await connectDatabase(await readDatabaseConfig());
  await db.query("BEGIN");
  for (const [i, a] of j.students.entries()) {
    if (
      a.email !== `demo0${i + 1}@colorverse.test` ||
      !a.authId ||
      !a.enrollmentId
    )
      throw Error("DEMO_IDENTITY_MISMATCH");
    const source = identities[i],
      label = `${source.realName} · 学号 ${source.studentNumber}`;
    const changed = await db.query(
      "UPDATE colorverse.users u SET display_name=$1 FROM colorverse.enrollments e WHERE e.user_id=u.id AND e.id=$2 AND e.class_id=$3 AND u.auth_subject=$4 RETURNING u.id",
      [label, a.enrollmentId, j.classId, a.authId],
    );
    if (changed.rowCount !== 1) throw Error("EXACT_MANAGED_ACCOUNT_REQUIRED");
    snapshot.students[i] = {
      ...snapshot.students[i],
      ...source,
      display_name: label,
    };
    a.displayName = label;
  }
  await db.query("COMMIT");
  for (const s of snapshot.students)
    for (const w of s.works)
      for (const interaction of w.interactions ?? []) {
        const index = /^演示学生 0([1-5])$/.exec(interaction.author)?.[1];
        if (index)
          interaction.author = `${identities[Number(index) - 1].realName}（演示账号）`;
      }
  await writeFile(
    "apps/web/public/competition/manifest.json",
    JSON.stringify(snapshot, null, 2) + "\n",
  );
  await writeFile(
    "work/demo-accounts.json",
    JSON.stringify(j, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: "attribution_synced",
      managedAccounts: 5,
      source: "original PPT filenames",
      realClassroomAccountsTouched: false,
    }),
  );
} catch (e) {
  await db?.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      status: "failed",
      code: /^[A-Z0-9_]+$/.test(e.message)
        ? e.message
        : "ATTRIBUTION_SYNC_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await db?.end();
}
