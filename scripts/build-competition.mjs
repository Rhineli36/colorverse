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
// The downloadable offline universe contains no live classroom IDs or real student identities.
const manifestPath = resolve(destination, "competition/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const identities = manifest.students.map((s) => ({
  name: s.realName ?? s.display_name.split(" · ")[0],
  number: s.studentNumber,
  alias: "同学 " + String(manifest.students.indexOf(s) + 1).padStart(2, "0"),
}));
const sanitize = (text) => {
  let value = text;
  for (const p of identities) {
    if (p.name) value = value.replaceAll(p.name, p.alias);
    if (p.number) value = value.replaceAll(p.number, "");
  }
  return value
    .replace(/（演示账号）/g, "")
    .replace(/^演示留言(?:（[^）]*）)?[：:]\s*/, "");
};
for (const [i, student] of manifest.students.entries()) {
  student.display_name = identities[i].alias;
  delete student.realName;
  delete student.studentNumber;
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
