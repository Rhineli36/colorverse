import { cp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import sharp from "sharp";
const root = fileURLToPath(new URL("../", import.meta.url));
const project = resolve(root, "work/desktop-app");
const resources = resolve(root, "work/desktop-resources");
const desktopPackage = JSON.parse(
  await readFile(resolve(root, "desktop/package.json"), "utf8"),
);
if (relative(root, project).replaceAll("\\", "/") !== "work/desktop-app")
  throw Error("INVALID_DESKTOP_DESTINATION");
const run = (args, capture = false) =>
  new Promise((ok, bad) => {
    const chunks = [];
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: process.env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      windowsHide: true,
    });
    child.stdout?.on("data", (chunk) => chunks.push(chunk));
    child.on("error", bad);
    child.on("exit", (code) =>
      code === 0
        ? ok(capture ? Buffer.concat(chunks).toString("utf8") : undefined)
        : bad(Error("DESKTOP_BUILD_FAILED")),
    );
  });
if (!process.env.npm_execpath) throw Error("Run using pnpm package:desktop");
if (!process.argv.includes("--reuse-site")) {
  await run([process.env.npm_execpath, "build:competition"]);
}
const release = JSON.parse(
  await readFile(resolve(root, "work/competition-site/release.json"), "utf8"),
);
if (release.mode !== "exhibition") throw Error("OFFLINE_FRONTEND_REQUIRED");
await rm(project, { recursive: true, force: true });
await mkdir(project, { recursive: true });
await mkdir(resources, { recursive: true });
await cp(resolve(root, "work/competition-site"), resolve(project, "site"), {
  recursive: true,
});
for (const file of ["main.mjs", "package.json"])
  await cp(resolve(root, "desktop", file), resolve(project, file));
const licenses = JSON.parse(
  await run(
    [process.env.npm_execpath, "licenses", "list", "--prod", "--json"],
    true,
  ),
);
const notices = [];
const licenseDir = resolve(project, "site/licenses/frontend");
await mkdir(licenseDir, { recursive: true });
for (const records of Object.values(licenses)) {
  for (const record of records) {
    const entry = {
      name: record.name,
      versions: record.versions,
      license: record.license,
      homepage: record.homepage,
    };
    notices.push(entry);
    for (const path of record.paths ?? []) {
      const files = await readdir(path, { withFileTypes: true });
      for (const file of files.filter(
        (f) =>
          f.isFile() &&
          /^(license|licence|notice|copying)([.\-_]|$)/i.test(f.name),
      )) {
        await cp(
          resolve(path, file.name),
          resolve(
            licenseDir,
            encodeURIComponent(record.name + "@" + record.versions.join("-")) +
              "-" +
              file.name,
          ),
        );
      }
    }
  }
}
await writeFile(
  resolve(licenseDir, "index.json"),
  JSON.stringify(notices, null, 2),
);
const svg = `<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="p" cx="32%" cy="25%"><stop stop-color="#eef4bf"/><stop offset=".6" stop-color="#9fd0ba"/><stop offset="1" stop-color="#527e91"/></radialGradient></defs><rect width="256" height="256" rx="52" fill="#081723"/><circle cx="128" cy="128" r="69" fill="url(#p)"/><ellipse cx="128" cy="128" rx="105" ry="30" transform="rotate(-28 128 128)" fill="none" stroke="#e5eabb" stroke-width="7"/><circle cx="203" cy="48" r="5" fill="#e5eabb"/></svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();
await writeFile(resolve(project, "icon.png"), png);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
await writeFile(resolve(resources, "icon.ico"), Buffer.concat([ico, png]));
await writeFile(
  resolve(project, "desktop-release.json"),
  JSON.stringify(
    {
      version: desktopPackage.version,
      electron: "44.9.0",
      frontend: release,
      privacy: {
        policy: "anonymous-exhibition-v1",
        profileDirectory: "ColorverseOfflineAnonymous",
        legacyProfileImported: false,
      },
    },
    null,
    2,
  ),
);
const config = {
  appId: "cn.colorverse.offline",
  productName: "色彩星球",
  electronVersion: "44.9.0",
  directories: {
    app: project,
    output: resolve(root, "outputs/desktop-build"),
    buildResources: resources,
  },
  files: [
    "main.mjs",
    "package.json",
    "icon.png",
    "desktop-release.json",
    "site/**/*",
    "!node_modules/**/*",
    "!**/node_modules/**/*",
  ],
  asar: true,
  compression: "normal",
  npmRebuild: false,
  win: {
    target: [{ target: "portable", arch: ["x64"] }],
    icon: resolve(resources, "icon.ico"),
    artifactName: "色彩星球-离线版-${version}-x64.${ext}",
  },
  portable: { requestExecutionLevel: "user", unpackDirName: true },
};
const configPath = resolve(root, "work/desktop-builder.json");
await writeFile(configPath, JSON.stringify(config, null, 2));
await run([
  resolve(root, "node_modules/electron-builder/cli.js"),
  "--config",
  configPath,
  "--win",
  "portable",
  "--x64",
  "--publish",
  "never",
]);
console.log(`Offline EXE built from ${release.sourceRevision}.`);
