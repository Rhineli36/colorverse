// Only the five explicitly managed exhibition identities and their 25 known works are writable.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  exhibitionDescriptions,
  exhibitionPeerComments,
} from "./exhibition-profiles.mjs";
let phase = "configuration";
try {
  const j = JSON.parse(await readFile("work/demo-accounts.json", "utf8"));
  if (
    j.marker !== "colorverse-class-demo-2026-10-14" ||
    j.students.length !== 5 ||
    j.students.some(
      (s, i) =>
        s.email !== `demo0${i + 1}@colorverse.test` || s.works.length !== 5,
    )
  )
    throw Error("MANAGED_DEMO_REQUIRED");
  phase = "interactions";
  let added = 0;
  const requestId = (value) => {
    const h = createHash("sha256")
      .update("presentation-details-v1/" + value)
      .digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  for (const [i, actor] of j.students.entries()) {
    const response = await fetch(
      "https://colorverse-dev.2999346.workers.dev/api/supabase/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: actor.email, password: actor.password }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw Error("LOGIN_FAILED");
    const auth = await response.json();
    if (auth.user.id !== actor.authId) throw Error("AUTH_MISMATCH");
    const api = async (path, body, method = "POST") => {
      const r = await fetch(
        `https://colorverse-dev.2999346.workers.dev/api/v1/cloud/classes/${j.classId}/${path}`,
        {
          headers: {
            Authorization: `Bearer ${auth.access_token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          method: body ? method : "GET",
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!r.ok) throw Error("API_" + r.status);
      return r.json();
    };
    phase = "descriptions";
    const gallery = await api("planets");
    const own = gallery.planets.find(
      (p) =>
        p.id === actor.planetId && p.owner_enrollment_id === actor.enrollmentId,
    );
    if (!own || gallery.actorId !== actor.enrollmentId)
      throw Error("OWNER_MISMATCH");
    for (const [k, record] of actor.works.entries()) {
      const w = own.works.find((w) => w.id === record.id && !w.withdrawn);
      if (!w) throw Error("MANAGED_WORK_MISSING");
      if (w.description !== exhibitionDescriptions[i][k])
        await api(
          `works/${w.id}/description`,
          { description: exhibitionDescriptions[i][k], revision: w.revision },
          "PUT",
        );
    }
    phase = "interactions";
    const target = j.students[(i + 1) % 5],
      content = "演示留言：" + exhibitionPeerComments[(i + 1) % 5];
    const history = (await api(`interactions?planetId=${target.planetId}`))
      .interactions;
    for (const workId of [null, target.works[0].id]) {
      if (
        !history.some(
          (r) =>
            r.own &&
            r.kind === "comment" &&
            r.work_id === workId &&
            r.content === content,
        )
      ) {
        await api("interactions", {
          requestId: requestId(
            `${actor.enrollmentId}/${workId ?? target.planetId}/comment`,
          ),
          planetId: target.planetId,
          workId,
          kind: "comment",
          content,
        });
        added++;
      }
      if (
        !history.some((r) => r.own && r.kind === "like" && r.work_id === workId)
      ) {
        await api("interactions", {
          requestId: requestId(
            `${actor.enrollmentId}/${workId ?? target.planetId}/like`,
          ),
          planetId: target.planetId,
          workId,
          kind: "like",
          content: "",
        });
        added++;
      }
    }
  }
  const snapshot = JSON.parse(
    await readFile("apps/web/public/competition/manifest.json", "utf8"),
  );
  for (const [i, s] of snapshot.students.entries())
    for (const [k, w] of s.works.entries())
      w.description = exhibitionDescriptions[i][k];
  await writeFile(
    "apps/web/public/competition/manifest.json",
    JSON.stringify(snapshot, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "synced",
      descriptions: 25,
      interactionsAdded: added,
      realStudentDataTouched: false,
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      status: "failed",
      phase,
      kind: e.name,
      transport: e.cause?.code ?? e.code,
      code: /^[A-Z0-9_]+$/.test(e.message) ? e.message : "DETAIL_SYNC_FAILED",
    }),
  );
  process.exitCode = 1;
}
