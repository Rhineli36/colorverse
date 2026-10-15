// Explicitly scoped to five already managed demo identities. Does not create users or touch real students.
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { growthElementColor } from "@colorverse/domain";
import { CloudPlanetDocumentSchema } from "@colorverse/contracts";
import { readDatabaseConfig } from "./supabase-database.mjs";
const journalFile = "work/cloud-exhibition-sync.json";
let phase = "configuration";
try {
  const config = await readDatabaseConfig();
  const managed = JSON.parse(await readFile("work/demo-accounts.json", "utf8"));
  const snapshot = JSON.parse(
    await readFile("apps/web/public/competition/manifest.json", "utf8"),
  );
  if (
    managed.marker !== "colorverse-class-demo-2026-10-14" ||
    managed.students.length !== 5 ||
    snapshot.students.length !== 5
  )
    throw Error("MANAGED_DEMO_REQUIRED");
  let journal;
  try {
    journal = JSON.parse(await readFile(journalFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    journal = {
      marker: "exhibition-cloud-2026-10-15",
      classId: managed.classId,
      media: {},
    };
  }
  if (
    journal.classId !== managed.classId ||
    journal.marker !== "exhibition-cloud-2026-10-15"
  )
    throw Error("JOURNAL_MISMATCH");
  const save = () =>
    writeFile(journalFile, JSON.stringify(journal, null, 2), { mode: 0o600 });
  let images = 0,
    elements = 0;
  for (const [i, actor] of managed.students.entries()) {
    if (
      actor.email !== `demo0${i + 1}@colorverse.test` ||
      !actor.planetId ||
      actor.works.length !== 5
    )
      throw Error("ACTOR_NOT_MANAGED");
    const source = snapshot.students[i];
    const appearance = CloudPlanetDocumentSchema.parse(source.document);
    phase = "login";
    const login = await fetch(
      "https://colorverse-dev.2999346.workers.dev/api/supabase/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          apikey: config.SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: actor.email, password: actor.password }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!login.ok) throw Error(`LOGIN_HTTP_${login.status}`);
    const auth = await login.json();
    if (auth.user.id !== actor.authId) throw Error("AUTH_MISMATCH");
    const api = async (path, method = "GET", body, mime) => {
      const response = await fetch(
        `https://colorverse-dev.2999346.workers.dev/api/v1/cloud/classes/${managed.classId}/${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${auth.access_token}`,
            ...(body ? { "Content-Type": mime ?? "application/json" } : {}),
          },
          body: body ? (mime ? body : JSON.stringify(body)) : undefined,
          signal: AbortSignal.timeout(60000),
          redirect: "error",
        },
      );
      if (!response.ok) throw Error(`CLOUD_${method}_${response.status}`);
      return response.json();
    };
    const own = async () => {
      const gallery = await api("planets"),
        p = gallery.planets.find(
          (p) =>
            p.id === actor.planetId &&
            p.owner_enrollment_id === actor.enrollmentId,
        );
      if (!p || gallery.actorId !== actor.enrollmentId)
        throw Error("OWNER_MISMATCH");
      return p;
    };
    phase = "appearance";
    let p = await own();
    await api(`planets/${p.id}/appearance`, "PUT", {
      name: appearance.metadata.name,
      color: appearance.color,
      skin: appearance.skin,
      summary: `${source.style}。往届设计色彩作业风格案例，外观和环境为 AI 辅助演绎。`,
      halo: appearance.halo,
      atmosphere: appearance.atmosphere,
      motion: appearance.motion,
      revision: p.document.revision,
    });
    for (const kind of ["exterior", "interior"]) {
      phase = `${kind}_image`;
      const file = source[kind];
      if (!/^[a-z0-9-]+\.webp$/.test(file)) throw Error("LOCAL_ASSET_REQUIRED");
      const bytes = await readFile(`apps/web/public/competition/${file}`),
        hash = createHash("sha256").update(bytes).digest("hex"),
        key = `${i}/${kind}`;
      p = await own();
      if (
        journal.media[key]?.hash === hash &&
        p.document.media[kind]?.id === journal.media[key].mediaId
      ) {
        images++;
        continue;
      }
      await api(
        `planets/${p.id}/${kind}?revision=${p.document.revision}&requestId=${randomUUID()}`,
        "POST",
        bytes,
        "image/webp",
      );
      p = await own();
      journal.media[key] = { hash, mediaId: p.document.media[kind]?.id };
      await save();
      images++;
    }
    phase = "element_colors";
    p = await own();
    for (const [k, record] of actor.works.entries()) {
      const w = p.works.find((w) => w.id === record.id && !w.withdrawn);
      if (!w) throw Error("MANAGED_WORK_MISSING");
      const color = growthElementColor(appearance.color, k);
      if (w.color !== color)
        await api(`works/${w.id}/element`, "PUT", {
          ...w.params,
          presetId: w.presetId,
          color,
          revision: w.revision,
        });
      snapshot.students[i].works[k].color = color;
      elements++;
    }
  }
  await writeFile(
    "apps/web/public/competition/manifest.json",
    JSON.stringify(snapshot, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "synced",
      managedPlanets: 5,
      images,
      elements,
      realStudentDataTouched: false,
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      status: "failed",
      phase,
      kind: e.name,
      transport: e.cause?.code,
      code: /^[A-Z0-9_]+$/.test(e.message) ? e.message : "SYNC_FAILED",
    }),
  );
  process.exitCode = 1;
}
