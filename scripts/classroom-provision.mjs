import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { readDatabaseConfig, connectDatabase } from "./supabase-database.mjs";
let client;
try {
  const config = await readDatabaseConfig();
  if (!config.SUPABASE_SECRET_KEY?.startsWith("sb_secret_"))
    throw new Error("SUPABASE_SECRET_KEY_REQUIRED");
  const api = async (path, method = "GET", body) => {
    const r = await fetch(config.SUPABASE_URL + path, {
      method,
      headers: {
        apikey: config.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!r.ok) throw new Error(`SUPABASE_HTTP_${r.status}`);
    return r.json();
  };
  let test;
  try {
    test = parseEnv(await readFile(".env.student-test.local", "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    test = {
      STUDENT_EMAIL: "student01@colorverse.test",
      STUDENT_PASSWORD: `Cv!${randomBytes(14).toString("base64url")}9`,
    };
    await writeFile(
      ".env.student-test.local",
      Object.entries(test)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  if (!test.STUDENT_AUTH_ID) {
    const users = await api("/auth/v1/admin/users?page=1&per_page=1000");
    let user = users.users.find((u) => u.email === test.STUDENT_EMAIL);
    if (!user)
      user = await api("/auth/v1/admin/users", "POST", {
        email: test.STUDENT_EMAIL,
        password: test.STUDENT_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: "学生测试 01" },
      });
    test.STUDENT_AUTH_ID = user.id;
    await writeFile(
      ".env.student-test.local",
      Object.entries(test)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
  }
  let buckets = await api("/storage/v1/bucket");
  let bucket = buckets.find((b) => b.id === "colorverse-classroom");
  if (!bucket)
    bucket = await api("/storage/v1/bucket", "POST", {
      id: "colorverse-classroom",
      name: "colorverse-classroom",
      public: false,
      file_size_limit: 8388608,
      allowed_mime_types: ["image/png", "image/jpeg", "image/webp"],
    });
  if (bucket.public) throw new Error("PRIVATE_BUCKET_REQUIRED");
  client = await connectDatabase(config);
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7301941)");
  const classes = await client.query(
    "SELECT c.id FROM colorverse.classes c JOIN colorverse.enrollments e ON e.class_id=c.id JOIN colorverse.users u ON u.id=e.user_id WHERE u.auth_subject=(SELECT id::text FROM auth.users WHERE email='2999346@qq.com') AND e.role='teacher' AND e.status='active' AND c.archived_at IS NULL",
  );
  if (classes.rows.length !== 1) throw new Error("EXACT_TEST_CLASS_REQUIRED");
  const issuer = config.SUPABASE_URL + "/auth/v1";
  let user = (
    await client.query(
      "SELECT id FROM colorverse.users WHERE auth_issuer=$1 AND auth_subject=$2",
      [issuer, test.STUDENT_AUTH_ID],
    )
  ).rows[0];
  if (!user)
    user = (
      await client.query(
        "INSERT INTO colorverse.users(id,auth_issuer,auth_subject,display_name) VALUES($1,$2,$3,'学生测试 01') RETURNING id",
        [randomUUID(), issuer, test.STUDENT_AUTH_ID],
      )
    ).rows[0];
  await client.query(
    "INSERT INTO colorverse.enrollments(id,class_id,user_id,role) VALUES($1,$2,$3,'student') ON CONFLICT(class_id,user_id) DO NOTHING",
    [randomUUID(), classes.rows[0].id, user.id],
  );
  let writer;
  try {
    writer = parseEnv(await readFile(".env.classroom-writer.local", "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    if (
      (
        await client.query(
          "SELECT 1 FROM pg_roles WHERE rolname='colorverse_classroom_writer'",
        )
      ).rows.length
    )
      throw new Error("WRITER_CREDENTIAL_FILE_REQUIRED");
    writer = {
      CLOUD_DATABASE_USER: "colorverse_classroom_writer",
      CLOUD_DATABASE_PASSWORD: randomBytes(32).toString("hex"),
    };
    await writeFile(
      ".env.classroom-writer.local",
      Object.entries(writer)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  if (!/^[a-f0-9]{64}$/.test(writer.CLOUD_DATABASE_PASSWORD ?? ""))
    throw new Error("INVALID_WRITER_CREDENTIAL");
  if (
    !(
      await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname='colorverse_classroom_writer'",
      )
    ).rows.length
  )
    await client.query(
      `CREATE ROLE colorverse_classroom_writer LOGIN PASSWORD '${writer.CLOUD_DATABASE_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
  await client.query(
    "GRANT USAGE ON SCHEMA colorverse TO colorverse_classroom_writer",
  );
  await client.query(
    "GRANT SELECT ON colorverse.users,colorverse.classes,colorverse.enrollments TO colorverse_classroom_writer",
  );
  await client.query(
    "GRANT SELECT,INSERT,UPDATE ON colorverse.planets,colorverse.showcase_works TO colorverse_classroom_writer",
  );
  await client.query(
    "GRANT SELECT,INSERT,DELETE ON colorverse.classroom_interactions TO colorverse_classroom_writer",
  );
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      status: "student_test_and_private_storage_ready",
      email: test.STUDENT_EMAIL,
      credentialFile: ".env.student-test.local",
    }),
  );
} catch (error) {
  await client?.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({
      status: "failed",
      code: /^[A-Z0-9_]{1,50}$/.test(error.code ?? error.message)
        ? (error.code ?? error.message)
        : "CLASSROOM_PROVISION_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
