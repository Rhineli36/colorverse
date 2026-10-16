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
  '@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (echo Please install Node.js first. & pause & exit /b 1)\r\nnode serve.mjs --open\r\npause\r\n',
);
backup["colorverse-static/运行说明.md"] = strToU8(
  "# 色彩星球离线体验\n\n预装 Node.js 22.12+。解压后运行 `node serve.mjs --open`，或在 Windows 双击“启动展示.cmd”。地址固定 http://127.0.0.1:5198；无需安装依赖。不要直接双击 index.html。关闭启动窗口即停止本机服务。\n\n启动默认游客浏览，右上角登录可选择学生或教师；退出后返回游客。离线身份选择用于本机体验，不是真实账号认证。学生创建星球、导入图片、提交作品、生成元素、互评，教师管理与评分，均保存在浏览器独立 IndexedDB。刷新与退出登录不会清除；换浏览器、换地址或清理浏览数据后不会共享。使用“重新开始”确认后恢复初始素材，仅清理此离线空间。\n\n五个作品风格案例、五个默认星球、二十五幅预览与知识卡均在包内。八色系二十三个情感案例已接入，四张临时 AI 图，其余为占位，最终图片待替换。无外网仍可完成本机流程；参考资料的外链除外。没有云端账户、跨设备同步、真实数据库和正式教学任务发布。\n\n预置点评及分数为案例准备数据，不代表原课程成绩。星球外貌、环境及临时案例图由 AI 辅助生成；往届作业预览用于获准的参赛准备，素材授权仍由负责人最终核对。离线包按负责人要求保留五位案例作者的姓名和学号，不附真实课堂账号凭证或云端密钥。详见源码 docs/51-emotion-offline-experience.md。\n",
);
const portable = {};
if (process.platform === "win32") {
  for (const [key, bytes] of Object.entries(backup))
    portable[key.replace("colorverse-static/", "colorverse-windows/")] = bytes;
  portable["colorverse-windows/runtime/node.exe"] = new Uint8Array(
    await readFile(process.execPath),
  );
  portable["colorverse-windows/runtime/NODE-LICENSE.txt"] = new Uint8Array(
    await readFile(
      process.env.COLORVERSE_NODE_LICENSE_PATH ??
        `docs/third-party/node-${process.version}-LICENSE.txt`,
    ),
  );
  portable["colorverse-windows/启动展示.cmd"] = strToU8(
    '@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node.exe" serve.mjs --open\r\npause\r\n',
  );
  portable["colorverse-windows/运行说明.md"] = strToU8(
    new TextDecoder()
      .decode(backup["colorverse-static/运行说明.md"])
      .replace(
        "预装 Node.js 22.12+。",
        "此 Windows x64 便携包已附 Node.js 运行时，无需另装 Node.js。",
      ),
  );
}
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
for (const bundle of [source, backup, portable])
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
  ...(Object.keys(portable).length
    ? [["色彩星球Windows便携体验包.zip", portable]]
    : []),
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
