import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";
import { GrowthPresetIds } from "@colorverse/contracts";

const provision = process.argv.includes("--provision"),
  seed = process.argv.includes("--seed");
if (!provision && !seed) throw new Error("USE_PROVISION_OR_SEED");
const journalFile = "work/demo-accounts.json";
const sourceFile = "work/demo-materials/selected.json";
const app = "https://colorverse-dev.2999346.workers.dev";
const marker = "colorverse-class-demo-2026-10-14";
let db,
  phase = "config";
try {
  const config = await readDatabaseConfig();
  phase = "materials";
  const raw = JSON.parse(await readFile(sourceFile, "utf8"));
  if (raw.length !== 5 || raw.some((r) => r.works.length !== 5))
    throw new Error("FIVE_STUDENTS_FIVE_WORKS_REQUIRED");
  await mkdir("work", { recursive: true });
  let journal;
  try {
    journal = JSON.parse(await readFile(journalFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    journal = {
      marker,
      students: raw.map((source, index) => ({
        email: `demo0${index + 1}@colorverse.test`,
        password: `Cv!${randomBytes(16).toString("base64url")}9`,
        displayName: `演示学生 0${index + 1}`,
        sourceIndex: index,
        works: source.works.map((w, j) => ({
          requestId: randomUUID(),
          sourceHash: w.sha256,
          sourceFile: w.file,
          title: w.title,
          presetId: GrowthPresetIds[(index * 5 + j) % GrowthPresetIds.length],
        })),
      })),
    };
    await writeFile(journalFile, JSON.stringify(journal, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (journal.marker !== marker || journal.students.length !== 5)
    throw new Error("INVALID_DEMO_JOURNAL");
  const save = () =>
    writeFile(journalFile, JSON.stringify(journal, null, 2) + "\n", {
      mode: 0o600,
    });
  const admin = async (path, method = "GET", body) => {
    const r = await fetch(config.SUPABASE_URL + path, {
      method,
      headers: {
        apikey: config.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!r.ok) throw new Error(`ADMIN_HTTP_${r.status}`);
    return r.json();
  };
  if (provision) {
    phase = "auth_accounts";
    const users = (await admin("/auth/v1/admin/users?page=1&per_page=1000"))
      .users;
    for (const student of journal.students) {
      let user = users.find((u) => u.email === student.email);
      if (user && user.user_metadata?.demo_marker !== marker)
        throw new Error("DEMO_EMAIL_ALREADY_IN_USE");
      // User-editable metadata is a label, never proof of a managed identity.
      if (user && student.authId && user.id !== student.authId)
        throw new Error("DEMO_AUTH_ID_MISMATCH");
      if (user && !student.authId) {
        const proof = await admin(
          "/auth/v1/token?grant_type=password",
          "POST",
          { email: student.email, password: student.password },
        );
        if (proof.user?.id !== user.id)
          throw new Error("DEMO_ACCOUNT_CONTROL_REQUIRED");
      }
      if (!user && student.authId) throw new Error("DEMO_AUTH_ACCOUNT_MISSING");
      if (!user)
        user = await admin("/auth/v1/admin/users", "POST", {
          email: student.email,
          password: student.password,
          email_confirm: true,
          user_metadata: {
            display_name: student.displayName,
            demo_marker: marker,
          },
        });
      student.authId = user.id;
      await save();
    }
    phase = "database";
    db = await connectDatabase(config);
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(7301944)");
    const classes = await db.query(
      "SELECT c.id,c.title FROM colorverse.classes c JOIN colorverse.enrollments e ON e.class_id=c.id JOIN colorverse.users u ON u.id=e.user_id WHERE u.auth_subject=(SELECT id::text FROM auth.users WHERE email='2999346@qq.com') AND e.role='teacher' AND e.status='active' AND c.archived_at IS NULL AND c.title LIKE '%测试%'",
    );
    if (classes.rows.length !== 1)
      throw new Error("EXACT_TEACHER_TEST_CLASS_REQUIRED");
    journal.classId = classes.rows[0].id;
    journal.classTitle = classes.rows[0].title;
    for (const student of journal.students) {
      const issuer = config.SUPABASE_URL + "/auth/v1";
      const user = (
        await db.query(
          "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name) VALUES($1,$2,$3,$4) ON CONFLICT(auth_issuer,auth_subject) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id",
          [randomUUID(), issuer, student.authId, student.displayName],
        )
      ).rows[0];
      const enrollment = (
        await db.query(
          "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'student') ON CONFLICT(class_id,user_id) DO UPDATE SET class_id=EXCLUDED.class_id RETURNING id,role,status",
          [randomUUID(), journal.classId, user.id],
        )
      ).rows[0];
      if (enrollment.role !== "student" || enrollment.status !== "active")
        throw new Error("INVALID_DEMO_ENROLLMENT");
      student.enrollmentId = enrollment.id;
    }
    await db.query("COMMIT");
    await save();
    const credentials = [
      "COLORVERSE 演示学生账号（仅保存在本机，不上传 GitHub）",
      `班级：${journal.classTitle}`,
      `网址：${app}/`,
      "",
      ...journal.students.flatMap((s) => [
        s.displayName,
        `邮箱：${s.email}`,
        `密码：${s.password}`,
        "",
      ]),
      "这是演示账号。作品来自往届第三周作业，互动为演示数据。",
    ];
    await writeFile("work/演示学生账号.txt", credentials.join("\n") + "\n", {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        status: "provisioned",
        students: 5,
        credentialFile: "work/演示学生账号.txt",
      }),
    );
  }
  if (seed) {
    if (!journal.classId || journal.students.some((s) => !s.authId))
      throw new Error("PROVISION_FIRST");
    const tokens = new Map();
    const login = async (student) => {
      const r = await fetch(
        config.SUPABASE_URL + "/auth/v1/token?grant_type=password",
        {
          method: "POST",
          headers: {
            apikey: config.SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: student.email,
            password: student.password,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!r.ok) throw new Error(`LOGIN_HTTP_${r.status}`);
      tokens.set(student.email, (await r.json()).access_token);
    };
    const call = async (student, path, method = "GET", body, mime) => {
      const binary = body instanceof Uint8Array;
      const r = await fetch(`${app}/api/v1/cloud/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${tokens.get(student.email)}`,
          ...(body !== undefined
            ? { "Content-Type": mime ?? "application/json" }
            : {}),
        },
        body:
          body === undefined ? undefined : binary ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
        redirect: "error",
      });
      if (!r.ok) throw new Error(`CLOUD_${method}_${r.status}`);
      return mime === "verify-bytes"
        ? new Uint8Array(await r.arrayBuffer())
        : r.json();
    };
    const profiles = [
      {
        name: "演示 · 流焰画室",
        skin: 0,
        color: "#efa568",
        halo: "ring",
        atmosphere: "fireflies",
        mode: "fast",
        trajectory: "ellipse",
      },
      {
        name: "演示 · 潮汐画室",
        skin: 2,
        color: "#5a9dde",
        halo: "soft",
        atmosphere: "stardust",
        mode: "slow",
        trajectory: "circle",
      },
      {
        name: "演示 · 翡翠画室",
        skin: 1,
        color: "#82c9ae",
        halo: "soft",
        atmosphere: "fireflies",
        mode: "slow",
        trajectory: "drift",
      },
      {
        name: "演示 · 紫雾画室",
        skin: 3,
        color: "#b397d4",
        halo: "ring",
        atmosphere: "stardust",
        mode: "fast",
        trajectory: "figure-eight",
      },
      {
        name: "演示 · 月岩画室",
        skin: 5,
        color: "#c5bdaa",
        halo: "none",
        atmosphere: "none",
        mode: "stationary",
        trajectory: "ellipse",
      },
    ];
    const base = `classes/${journal.classId}`;
    for (const [index, student] of journal.students.entries()) {
      await login(student);
      const identity = await call(student, "session");
      if (
        !identity.memberships.some(
          (m) =>
            m.classId === journal.classId &&
            m.role === "student" &&
            m.enrollmentId === student.enrollmentId,
        )
      )
        throw new Error("IDENTITY_MISMATCH");
      const profile = profiles[index],
        source = raw[student.sourceIndex];
      if (!student.planetId) {
        student.planetId = (
          await call(student, `${base}/planets`, "POST", {
            name: profile.name,
            color: profile.color,
            skin: profile.skin,
          })
        ).id;
        await save();
      }
      const getPlanet = async () => {
        const data = await call(student, `${base}/planets`);
        const own = data.planets.find(
          (p) =>
            p.id === student.planetId && p.owner_enrollment_id === data.actorId,
        );
        if (!own) throw new Error("DEMO_PLANET_OWNER_MISMATCH");
        return own;
      };
      let planet = await getPlanet();
      if (!student.profileSeeded) {
        await call(
          student,
          `${base}/planets/${student.planetId}/appearance`,
          "PUT",
          {
            name: profile.name,
            skin: profile.skin,
            color: profile.color,
            atmosphere: profile.atmosphere,
            halo: profile.halo,
            motion: {
              version: "1.0.0",
              mode: profile.mode,
              trajectory: profile.trajectory,
              range: "wide",
              direction: index % 2 ? "reverse" : "forward",
            },
            brightness: 0.8,
            saturation: 1,
            summary: `演示星球：展示往届第3周${source.author}的作品。此账号和互动用于演示，不计正式课程成绩。外貌、内部背景为可替换的演示预设。`,
            practice: "tone",
            revision: planet.document.revision ?? 0,
          },
        );
        student.profileSeeded = true;
        await save();
        planet = await getPlanet();
      }
      for (const kind of ["exterior", "interior"]) {
        student.mediaRequests ??= {};
        student.mediaRequests[kind] ??= randomUUID();
        await save();
        if (student[kind + "Seeded"]) continue;
        if (planet.document.media?.[kind] && !student[kind + "MediaId"])
          throw new Error("DO_NOT_REPLACE_EXISTING_DEMO_MEDIA");
        const bytes = await readFile(
          kind === "exterior"
            ? `apps/web/public/demo/v2/body-${profile.skin}.webp`
            : "packages/renderer/src/assets/universe-v2.webp",
        );
        const result = await call(
          student,
          `${base}/planets/${student.planetId}/${kind}?requestId=${student.mediaRequests[kind]}&revision=${planet.document.revision ?? 0}`,
          "POST",
          bytes,
          "image/webp",
        );
        student[kind + "MediaId"] = result.id;
        student[kind + "Seeded"] = true;
        await save();
        planet = await getPlanet();
      }
      for (const [j, record] of student.works.entries()) {
        const sourceWork = source.works[j];
        const bytes = await readFile(record.sourceFile);
        if (
          createHash("sha256").update(bytes).digest("hex") !==
            record.sourceHash ||
          record.sourceHash !== sourceWork.sha256
        )
          throw new Error("SOURCE_CHANGED");
        if (!record.id) {
          if (index === 0 && j === 4) record.presetId = "color-fan";
          if (index === 3 && j === 4) record.presetId = "glass-lantern";
          await save();
          const description =
            `往届第3周设计色彩作业；原作者：${source.author}。展示账号用于演示，图片直接提取自原PPTX，未重绘。` +
            (sourceWork.text ? `\n原作说明：${sourceWork.text}` : "");
          const query = new URLSearchParams({
            requestId: record.requestId,
            title: record.title,
            description,
          });
          const result = await call(
            student,
            `${base}/works?${query}`,
            "POST",
            bytes,
            record.sourceFile.endsWith(".jpg") ? "image/jpeg" : "image/png",
          );
          record.id = result.id;
          await save();
        }
        if (!record.elementSeeded) {
          planet = await getPlanet();
          const saved = planet.works.find((w) => w.id === record.id);
          if (!saved || saved.withdrawn)
            throw new Error("DEMO_WORK_UNAVAILABLE");
          await call(student, `${base}/works/${record.id}/element`, "PUT", {
            revision: saved.revision,
            presetId: record.presetId,
            color: profile.color,
            x: [0.18, 0.38, 0.6, 0.8, 0.5][j],
            y: [0.36, 0.62, 0.36, 0.65, 0.8][j],
            size: 0.9,
            motion: ["float", "breathe", "rotate", "still", "float"][j],
          });
          record.elementSeeded = true;
          await save();
        }
        if (!record.originalVerified) {
          const original = await call(
            student,
            `${base}/works/${record.id}/original`,
            "GET",
            undefined,
            "verify-bytes",
          );
          if (
            createHash("sha256").update(original).digest("hex") !==
            record.sourceHash
          )
            throw new Error("ORIGINAL_ROUNDTRIP_FAILED");
          record.originalVerified = true;
          await save();
        }
        console.log(
          JSON.stringify({
            status: "artwork_ready",
            student: index + 1,
            work: j + 1,
          }),
        );
      }
    }
    for (const [index, student] of journal.students.entries()) {
      const target = journal.students[(index + 1) % 5];
      student.interactions ??= Array.from({ length: 6 }, () => ({
        requestId: randomUUID(),
      }));
      await save();
      if (!student.visited) {
        await call(student, `${base}/guide`, "POST", {
          planetId: target.planetId,
        });
        student.visited = true;
        await save();
      }
      for (let i = 0; i < 6; i++) {
        const record = student.interactions[i];
        if (record.seeded) continue;
        const kind = ["like", "emoji", "comment"][i % 3];
        await call(student, `${base}/interactions`, "POST", {
          requestId: record.requestId,
          planetId: target.planetId,
          workId: i < 3 ? null : target.works[index].id,
          kind,
          content:
            kind === "like"
              ? ""
              : kind === "emoji"
                ? ["✨", "💙", "👏", "🔥", "🌈"][index]
                : "演示留言：这组配色的冷暖关系很清楚，色彩和构图值得交流。",
        });
        record.seeded = true;
        await save();
      }
    }
    for (const index of [0, 1, 4]) {
      const student = journal.students[index],
        target = journal.students[3];
      student.extraInteractions ??= Array.from({ length: 2 }, () => ({
        requestId: randomUUID(),
      }));
      await save();
      for (const [j, record] of student.extraInteractions.entries()) {
        if (record.seeded) continue;
        const kind =
          index === 0 && j === 0 ? "like" : j === 0 ? "emoji" : "comment";
        await call(student, `${base}/interactions`, "POST", {
          requestId: record.requestId,
          planetId: target.planetId,
          workId: index === 4 ? target.works[4].id : null,
          kind,
          content:
            kind === "like"
              ? ""
              : kind === "emoji"
                ? "🌈"
                : "演示留言：这件作品的色彩层次很丰富，想听听你的配色思路。",
        });
        record.seeded = true;
        await save();
      }
    }
    journal.seededAt = new Date().toISOString();
    await save();
    await writeFile(
      "outputs/classroom-demo-import.json",
      JSON.stringify(
        {
          status: "ready",
          students: 5,
          planets: 5,
          artworks: 25,
          interactions: 36,
          originalsVerified: 25,
          privateStorage: true,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        status: "seeded",
        students: 5,
        artworks: 25,
        interactions: 36,
        credentials: "work/演示学生账号.txt",
      }),
    );
  }
} catch (error) {
  await db?.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      status: "failed",
      phase,
      errorName: error.name,
      transportCode: error.cause?.code,
      code: /^[A-Z0-9_]{1,80}$/.test(error.message ?? "")
        ? error.message
        : "DEMO_SETUP_FAILED",
      note: "Existing student data was not targeted; retry resumes the private journal.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db?.end();
}
