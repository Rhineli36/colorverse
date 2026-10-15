// Read-only export limited to the five managed demo accounts and known work IDs.
import { readFile, writeFile } from "node:fs/promises";
const file = "apps/web/public/competition/manifest.json";
try {
  const j = JSON.parse(await readFile("work/demo-accounts.json", "utf8")),
    snapshot = JSON.parse(await readFile(file, "utf8"));
  if (
    j.marker !== "colorverse-class-demo-2026-10-14" ||
    j.students.length !== 5
  )
    throw Error("MANAGED_DEMO_REQUIRED");
  const actor = j.students[0],
    base = "https://colorverse-dev.2999346.workers.dev";
  const login = await fetch(
    base + "/api/supabase/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: actor.email, password: actor.password }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!login.ok) throw Error("AUTH_FAILED");
  const auth = await login.json();
  if (auth.user.id !== actor.authId) throw Error("AUTH_MISMATCH");
  const api = async (path) => {
    const r = await fetch(`${base}/api/v1/cloud/classes/${j.classId}/${path}`, {
      headers: { Authorization: `Bearer ${auth.access_token}` },
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw Error("READ_FAILED");
    return r.json();
  };
  const gallery = await api("planets");
  let responses = 0;
  const sent = new Map(j.students.map((s) => [s.displayName, 0]));
  for (const [i, student] of j.students.entries()) {
    const p = gallery.planets.find(
      (p) =>
        p.id === student.planetId &&
        p.owner_enrollment_id === student.enrollmentId,
    );
    if (!p) throw Error("MANAGED_PLANET_MISSING");
    const target = snapshot.students[i];
    // Metadata contains only user-facing writing; private media keys and real cloud IDs are never exported here.
    target.document.metadata = p.document.metadata;
    target.document.brightness = p.document.brightness;
    target.document.saturation = p.document.saturation;
    const interactions = (
      await api(`interactions?planetId=${p.id}`)
    ).interactions.filter((r) => sent.has(r.display_name));
    for (const r of interactions)
      sent.set(r.display_name, sent.get(r.display_name) + 1);
    const sanitize = (r) => ({
      kind: r.kind,
      content: r.content,
      author: r.display_name.split(" · ")[0] + "（演示账号）",
    });
    target.planetInteractions = interactions
      .filter((r) => !r.work_id)
      .map(sanitize);
    target.received = interactions.length;
    for (const [k, record] of student.works.entries()) {
      const w = p.works.find((w) => w.id === record.id);
      if (!w || w.withdrawn) throw Error("MANAGED_WORK_MISSING");
      const out = target.works[k];
      out.title = w.title;
      out.description = w.description;
      out.params = w.params;
      out.color = w.color;
      out.createdAt = w.createdAt;
      out.interactions = interactions
        .filter((r) => r.work_id === w.id)
        .map(sanitize);
      responses += out.interactions.length;
    }
  }
  for (const [i, s] of snapshot.students.entries())
    s.sent = sent.get(j.students[i].displayName);
  await writeFile(file, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: "read_only_demo_snapshot_refreshed",
      works: 25,
      workInteractions: responses,
      realRosterExported: false,
    }),
  );
} catch {
  console.error("Snapshot refresh failed; private data was not printed.");
  process.exitCode = 1;
}
