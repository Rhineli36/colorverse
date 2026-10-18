// Managed demonstration identities only. Credentials and journals stay under ignored work/.
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";
const journalPath = "work/judges-accounts.json",
  marker = "colorverse-judges-2026-10-18";
const app = "https://colorverse-dev.2999346.workers.dev";
const mode = process.argv.includes("--provision")
  ? "provision"
  : process.argv.includes("--seed")
    ? "seed"
    : "";
if (!mode) throw new Error("USE_PROVISION_OR_SEED");
let db,
  phase = "configuration";
try {
  const config = await readDatabaseConfig();
  let j;
  try {
    j = JSON.parse(await readFile(journalPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    j = {
      marker,
      courseId: randomUUID(),
      classId: randomUUID(),
      accounts: ["teacher", "student", "student", "student"].map((role, i) => ({
        role,
        email: `${i === 0 ? "demo_teacher" : i === 1 ? "demo_student" : `demo_sample${i}`}@colorverse.test`,
        password: `Star${Array.from(randomBytes(8), (v) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[v % 29]).join("")}`,
        name:
          i === 0 ? "评审体验教师" : i === 1 ? "评审体验学生" : "示例学生 " + i,
        enrollmentId: randomUUID(),
        userId: randomUUID(),
        groupId: randomUUID(),
        uploads: [],
      })),
    };
    await writeFile(journalPath, JSON.stringify(j, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (j.marker !== marker || j.accounts.length !== 4)
    throw new Error("INVALID_JOURNAL");
  const save = () =>
    writeFile(journalPath, JSON.stringify(j, null, 2), { mode: 0o600 });
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
  if (mode === "provision") {
    phase = "accounts";
    const users = (await admin("/auth/v1/admin/users?page=1&per_page=1000"))
      .users;
    for (const a of j.accounts) {
      let u = users.find((u) => u.email === a.email);
      if (u) {
        if (a.authId && a.authId !== u.id) throw new Error("DEMO_ID_MISMATCH");
        const proof = await admin(
          "/auth/v1/token?grant_type=password",
          "POST",
          { email: a.email, password: a.password },
        );
        if (proof.user?.id !== u.id)
          throw new Error("ACCOUNT_CONTROL_REQUIRED");
      } else {
        if (a.authId) throw new Error("MANAGED_ACCOUNT_MISSING");
        u = await admin("/auth/v1/admin/users", "POST", {
          email: a.email,
          password: a.password,
          email_confirm: true,
          user_metadata: { display_name: a.name, demo_marker: marker },
        });
      }
      a.authId = u.id;
      await save();
    }
    phase = "isolated_class";
    db = await connectDatabase(config);
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(7301947)");
    for (const a of j.accounts) {
      const found = (
        await db.query(
          "SELECT id FROM colorverse.users WHERE auth_issuer=$1 AND auth_subject=$2",
          [config.SUPABASE_URL + "/auth/v1", a.authId],
        )
      ).rows[0];
      if (found && found.id !== a.userId)
        throw new Error("CLASS_IDENTITY_MISMATCH");
      await db.query(
        "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [a.userId, config.SUPABASE_URL + "/auth/v1", a.authId, a.name],
      );
    }
    await db.query(
      "INSERT INTO colorverse.courses(id,title,created_by) VALUES($1,'色彩星球评审专用 · 演示内容',$2) ON CONFLICT DO NOTHING",
      [j.courseId, j.accounts[0].userId],
    );
    await db.query(
      "INSERT INTO colorverse.classes(id,course_id,title,term,timezone) VALUES($1,$2,'色彩星球 · 评审体验班（演示内容）','2026 演示','Asia/Shanghai') ON CONFLICT DO NOTHING",
      [j.classId, j.courseId],
    );
    for (const a of j.accounts)
      await db.query(
        "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [a.enrollmentId, j.classId, a.userId, a.role],
      );
    await db.query(
      "INSERT INTO colorverse.isolated_account_courses(course_id) VALUES($1) ON CONFLICT DO NOTHING",
      [j.courseId],
    );
    await db.query("COMMIT");
    await db.end();
    db = undefined;
  }
  if (mode === "seed") {
    phase = "real_cloud_requests";
    const tokens = new Map();
    for (const a of j.accounts) {
      const r = await fetch(
        app + "/api/supabase/auth/v1/token?grant_type=password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: a.email, password: a.password }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!r.ok) throw new Error(`LOGIN_HTTP_${r.status}`);
      tokens.set(
        a.role === "teacher" ? "teacher" : a.email,
        (await r.json()).access_token,
      );
    }
    const api = async (a, path, init = {}) => {
      const r = await fetch(
        `${app}/api/v1/cloud/classes/${j.classId}/${path}`,
        {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${tokens.get(a.role === "teacher" ? "teacher" : a.email)}`,
          },
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!r.ok) throw new Error(`CLASSROOM_HTTP_${r.status}`);
      return r.json();
    };
    const json = (body, method = "POST") => ({
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const teacher = j.accounts[0],
      settings = (await api(teacher, "learning-tasks")).tasks;
    for (const t of settings)
      if (!t.published)
        await api(
          teacher,
          "learning-tasks",
          json({ ...t, published: true }, "PUT"),
        );
    for (const [i, a] of j.accounts.slice(1).entries()) {
      const planet = await api(a, "planets", json({ random: true }));
      a.planetId = planet.id;
      await save();
      const p = (await api(a, "planets")).planets.find(
        (p) => p.id === a.planetId,
      );
      if (!a.appearanceSaved) {
        await api(
          a,
          `planets/${a.planetId}/appearance`,
          json(
            {
              name:
                i === 0
                  ? "我的体验星球"
                  : i === 1
                    ? "示例 · 暮色与晨光"
                    : "示例 · 花园与雨季",
              skin: i === 0 ? 4 : 3,
              color: i === 0 ? "#8d72bc" : "#7dac93",
              summary: "隔离的色彩教学演示；历史作业素材用于流程演示。",
              learningIntent: {
                intendedMoods: [i === 0 ? "神秘" : "宁静"],
                customMood: "",
                paletteColors: [i === 0 ? "#8d72bc" : "#7dac93"],
                colorRationale: "以主色面积与明暗对比探索氛围。",
              },
              revision: p.document.revision,
            },
            "PUT",
          ),
        );
        a.appearanceSaved = true;
        await save();
      }
      for (const kind of ["exterior", "interior"]) {
        if (a.media?.[kind]) continue;
        const current = (await api(a, "planets")).planets.find(
          (p) => p.id === a.planetId,
        );
        const bytes = await readFile(
          `apps/web/public/competition/case-${i + 1}-${kind}.webp`,
        );
        const id = randomUUID();
        await api(
          a,
          `planets/${a.planetId}/${kind}?revision=${current.document.revision}&requestId=${id}`,
          {
            method: "POST",
            headers: { "Content-Type": "image/webp" },
            body: bytes,
          },
        );
        a.media = { ...a.media, [kind]: id };
        await save();
      }
      for (let k = 0; k < 2; k++) {
        let w = a.uploads[k];
        if (!w) {
          w = {
            requestId: randomUUID(),
            variant: k === 0 ? "方案 A" : "方案 B",
          };
          a.uploads[k] = w;
          await save();
        }
        if (!w.id) {
          const bytes = await readFile(
            `apps/web/public/competition/student-${i + 1}-work-${k + 1}.webp`,
          );
          const form = new FormData();
          form.set(
            "image",
            new Blob([bytes], { type: "image/webp" }),
            "example.webp",
          );
          form.set(
            "metadata",
            JSON.stringify({
              title: `色彩比较 · ${w.variant}`,
              description:
                "负责人授权的历史作业素材；演示说明和点评为预先编写，不是原作者意图或真实课程成绩。",
              learning: {
                taskId: "T01",
                comparisonGroupId: a.groupId,
                variantLabel: w.variant,
                intendedMoods: [k === 0 ? "宁静" : "活跃"],
                customMood: "",
                paletteColors:
                  k === 0 ? ["#73919F", "#B1C6C2"] : ["#C86B45", "#E8BA54"],
                colorRationale:
                  k === 0
                    ? "演示说明：观察较集中主色与柔和层次。"
                    : "演示说明：观察暖色与较明显的明暗差异。",
              },
            }),
          );
          w.id = (
            await api(a, `works?requestId=${w.requestId}`, {
              method: "POST",
              body: form,
            })
          ).id;
          await save();
        }
        const review = await api(teacher, `works/${w.id}/review`);
        if (!review.review && k === 0)
          await api(
            teacher,
            `works/${w.id}/review`,
            json({
              score: i === 2 ? null : 92,
              comment:
                "演示点评（非原课程成绩）：请结合具体颜色面积与明暗，补充两版比较的依据。",
              revision: 0,
              requestId: randomUUID(),
            }),
          );
      }
    }
    for (const [i, a] of j.accounts.slice(1).entries()) {
      const other = j.accounts[1 + (i === 0 ? 1 : 0)];
      if (!a.feedbackSaved) {
        await api(
          a,
          "interactions",
          json({
            planetId: other.planetId,
            workId: other.uploads[0].id,
            kind: "comment",
            content: "演示教学观察反馈",
            observation: {
              perceivedMoods: ["宁静"],
              customMood: "",
              visualEvidence: "演示反馈：观察主要区域的颜色与背景明暗关系。",
              suggestion: "可以试着改变点缀色面积，再比较视觉重点。",
            },
            requestId:
              a.feedbackRequestId ?? (a.feedbackRequestId = randomUUID()),
          }),
        );
        a.feedbackSaved = true;
        await save();
      }
    }
  }
  await writeFile(
    "work/评审体验账号_私密.txt",
    [
      "仅供项目负责人保管，不随源码包和静态包公开。",
      ...j.accounts.map(
        (a) =>
          `${a.name}\n账号：${a.loginAccount || a.email}\n密码：${a.password}\n`,
      ),
    ].join("\n"),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: "complete",
      mode,
      classId: j.classId,
      accounts: 4,
      credentials: "work/评审体验账号_私密.txt",
    }),
  );
} catch (e) {
  await db?.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      status: "failed",
      phase,
      code: /^[A-Z0-9_]+$/.test(e.message)
        ? e.message
        : "DEMO_OPERATION_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await db?.end();
}
