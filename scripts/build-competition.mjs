import { spawn } from "node:child_process";
import { cp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  destination = resolve(root, "work/competition-site");
if (
  relative(root, destination).replaceAll("\\", "/") !== "work/competition-site"
)
  throw Error("INVALID_STATIC_DESTINATION");
await new Promise((ok, bad) => {
  const child = spawn(process.execPath, [process.env.npm_execpath, "build"], {
    cwd: root,
    env: {
      ...process.env,
      VITE_EXHIBITION_MODE: "true",
      VITE_ENABLE_CLOUD_AUTH: "false",
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
      VITE_USE_AUTH_PROXY: "false",
      VITE_BASE_PATH: "./",
    },
    stdio: "inherit",
  });
  child.on("error", bad);
  child.on("exit", (code) =>
    code === 0 ? ok() : bad(Error("COMPETITION_BUILD_FAILED")),
  );
});
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(resolve(root, "apps/web/dist"), destination, { recursive: true });
// Keep the five case authors credited as requested; live classroom IDs and credentials remain excluded.
const manifestPath = resolve(destination, "competition/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sanitize = (text) => {
  return text
    .replace(/（演示账号）/g, "")
    .replace(/^演示留言(?:（[^）]*）)?[：:]\s*/, "");
};
for (const student of manifest.students) {
  student.display_name =
    student.realName && student.studentNumber
      ? `${student.realName} · 学号 ${student.studentNumber}`
      : sanitize(student.display_name);
  student.document.metadata.demoWriting = false;
  for (const w of student.works) {
    if (w.description) w.description = sanitize(w.description);
    w.interactions = w.interactions?.map((r) => ({
      ...r,
      author: sanitize(r.author),
      content: sanitize(r.content),
    }));
  }
  student.planetInteractions = student.planetInteractions?.map((r) => ({
    ...r,
    author: sanitize(r.author),
    content: sanitize(r.content),
  }));
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
await writeFile(
  resolve(destination, "competition/cloud-exterior-previews.json"),
  "[]\n",
);
await writeFile(
  resolve(destination, "competition/example-work-dates.json"),
  "{}\n",
);
console.log(
  "Competition static site saved under work/competition-site; no cloud credentials required at runtime.",
);
