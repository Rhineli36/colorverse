import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { zipSync, unzipSync, strToU8 } from "fflate";
const out = "outputs/competition-delivery";
await mkdir(out, { recursive: true });
const skip = new Set([
  "node_modules",
  "dist",
  ".git",
  "work",
  "outputs",
  ".wrangler",
  "coverage",
  "__pycache__",
  "secrets",
]);
const source = {};
async function walk(path, target) {
  for (const f of await readdir(path, { withFileTypes: true })) {
    if (
      skip.has(f.name) ||
      (f.name.startsWith(".env") && f.name !== ".env.example") ||
      f.name.startsWith(".dev.vars") ||
      /\.(log|pyc)$/.test(f.name) ||
      f.isSymbolicLink()
    )
      continue;
    const p = join(path, f.name),
      t = target + "/" + f.name;
    if (f.isDirectory()) await walk(p, t);
    else if (f.isFile()) source[t] = new Uint8Array(await readFile(p));
  }
}
for (const d of [
  "apps",
  "packages",
  "scripts",
  "tests",
  "docs",
  "deploy",
  ".github",
])
  await walk(d, "colorverse-source/" + d);
for (const f of [
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vitest.config.ts",
  "eslint.config.js",
  "wrangler.json",
  ".gitattributes",
  ".gitignore",
  ".dockerignore",
]) {
  try {
    source["colorverse-source/" + f] = new Uint8Array(await readFile(f));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const backup = {};
async function staticWalk(path, target = "") {
  for (const f of await readdir(path, { withFileTypes: true })) {
    const p = join(path, f.name),
      t = target + f.name;
    if (f.isDirectory()) await staticWalk(p, t + "/");
    else if (f.isFile())
      backup["colorverse-static/" + t] = new Uint8Array(await readFile(p));
  }
}
await staticWalk("work/competition-site");
backup["colorverse-static/serve.mjs"] = new Uint8Array(
  await readFile("scripts/static-preview.mjs"),
);
backup["colorverse-static/启动展示.cmd"] = strToU8(
  '@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (echo Please install Node.js first. & pause & exit /b 1)\r\nstart "" "http://127.0.0.1:5198"\r\nnode serve.mjs\r\npause\r\n',
);
backup["colorverse-static/运行说明.md"] = strToU8(
  "# 色彩星球静态展示备用版\n\n请预装 Node.js。解压后在本目录运行 `node serve.mjs`，或在 Windows 双击“启动展示.cmd”。打开 http://127.0.0.1:5198。无需安装依赖。不要直接双击 index.html。\n\n包含五个匿名作品风格案例、五个默认星球、二十五幅作品预览、教学卡片、三个模板、演示点评和成长播放。全部展示素材在包内；关闭互联网仍可浏览。参考资料的外部链接除外。\n\n这是静态快照，没有真实登录、上传、云数据库写入、评分或互评。点赞只在当前页面生效，刷新不保存。预置建议分不代表原课程成绩。星球外貌和场景为 AI 辅助素材；历史作业预览由负责人授权用于演示。\n\n真实教学入口与账号由负责人另行提供。完整源码包的 docs/47-competition-run-and-package.md 说明三种运行模式及外部依赖。\n",
);
const secrets = [];
for (const f of [
  ".env.supabase.local",
  ".env.cloudflare.local",
  ".env.student-test.local",
  ".env.classroom-writer.local",
]) {
  try {
    for (const [k, v] of Object.entries(parseEnv(await readFile(f, "utf8"))))
      if (/PASSWORD|SECRET|TOKEN/.test(k) && v.length >= 12) secrets.push(v);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
for (const f of [
  "work/learning-demo-accounts.json",
  "work/demo-accounts.json",
]) {
  try {
    const j = JSON.parse(await readFile(f, "utf8"));
    for (const a of j.accounts ?? j.students ?? []) secrets.push(a.password);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
for (const bundle of [source, backup])
  for (const [n, bytes] of Object.entries(bundle)) {
    if (
      /(^|\/)(work|node_modules|outputs|\.git|secrets)(\/|$)/.test(n) ||
      /\.env(?!\.example)/.test(n)
    )
      throw new Error("PRIVATE_FILE_IN_PACKAGE");
    const t = new TextDecoder().decode(bytes);
    if (secrets.some((v) => t.includes(v)))
      throw new Error("SECRET_VALUE_IN_PACKAGE");
  }
const results = [];
for (const [name, files] of [
  ["色彩星球源码包.zip", source],
  ["色彩星球静态展示备用包.zip", backup],
]) {
  const bytes = zipSync(files, { level: 6 }),
    roundtrip = unzipSync(bytes);
  if (Object.keys(roundtrip).length !== Object.keys(files).length)
    throw new Error("ZIP_ROUNDTRIP_FAILED");
  const path = out + "/" + name;
  await writeFile(path, bytes);
  results.push({
    path,
    files: Object.keys(files).length,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    secretAudit: "passed",
  });
}
await writeFile(
  out + "/打包校验.json",
  JSON.stringify(
    { createdAt: new Date().toISOString(), packages: results },
    null,
    2,
  ),
);
console.log(JSON.stringify({ status: "packaged", packages: results }, null, 2));
