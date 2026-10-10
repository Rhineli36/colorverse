import JSZip from "jszip";
import { Unzip, UnzipInflate } from "fflate";
import { z } from "zod";
import {
  VERSION,
  UniverseSchema,
  MOTION_CAPABILITY,
  type PlanetDocument,
  type UniverseDocument,
} from "@colorverse/contracts";
import { validatePlanet, DomainError, clone } from "@colorverse/domain";
import type { AssetStore } from "@colorverse/application";
import { imageInfo } from "./media";
export { imageInfo } from "./media";
export async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
const MAX_ZIP = 100 * 1024 * 1024,
  MAX_OUTPUT = 200 * 1024 * 1024,
  MAX_JSON = 5 * 1024 * 1024;
export function safePath(path: string) {
  if (
    !/^[a-zA-Z0-9_./-]+$/.test(path) ||
    path.startsWith("/") ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    path.includes(":") ||
    path.includes("\\")
  )
    throw new DomainError("VALIDATION_FAILED", "作品包包含不安全的文件路径");
  return path;
}
const ManifestSchema = z.strictObject({
  packageType: z.enum(["planet", "universe"]),
  packageVersion: z.enum([VERSION, "1.1.0"]),
  exportMode: z.literal("backup"),
  documentType: z.literal("planet"),
  exportId: z.uuid(),
  exportedAt: z.iso.datetime(),
  entrypoint: z.enum(["planet.json", "universe.json"]),
  producer: z.strictObject({ name: z.string(), version: z.string() }),
  files: z
    .array(
      z.strictObject({
        path: z.string(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        byteSize: z.number().int().positive().max(MAX_OUTPUT),
        mimeType: z.string(),
      }),
    )
    .max(1000),
  requiredCapabilities: z.array(z.string()).max(30),
});
export interface PackageReport {
  manifest: z.infer<typeof ManifestSchema>;
  planets: PlanetDocument[];
  universe: UniverseDocument | null;
  files: Map<string, Blob>;
  warnings: string[];
}
function centralEntries(bytes: Uint8Array) {
  if (bytes.length > MAX_ZIP)
    throw new DomainError("QUOTA_EXCEEDED", "作品包超过 100 MiB");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (v.getUint32(p, true) === 0x06054b50) {
      end = p;
      break;
    }
  if (end < 0 || end + 22 + v.getUint16(end + 20, true) !== bytes.length)
    throw new DomainError("VALIDATION_FAILED", "ZIP 尾目录损坏");
  if (v.getUint16(end + 4, true) !== 0 || v.getUint16(end + 6, true) !== 0)
    throw new DomainError("VALIDATION_FAILED", "不支持分卷 ZIP");
  const count = v.getUint16(end + 10, true),
    start = v.getUint32(end + 16, true),
    size = v.getUint32(end + 12, true);
  if (count > 1000 || count === 65535 || start + size !== end)
    throw new DomainError("VALIDATION_FAILED", "ZIP 条目超限或格式不支持");
  const entries = new Map<string, { size: number; compressed: number }>(),
    seen = new Set<string>();
  let p = start,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || v.getUint32(p, true) !== 0x02014b50)
      throw new DomainError("VALIDATION_FAILED", "ZIP 中央目录损坏");
    const flags = v.getUint16(p + 8, true),
      method = v.getUint16(p + 10, true),
      csize = v.getUint32(p + 20, true),
      usize = v.getUint32(p + 24, true),
      n = v.getUint16(p + 28, true),
      e = v.getUint16(p + 30, true),
      c = v.getUint16(p + 32, true),
      local = v.getUint32(p + 42, true),
      mode = v.getUint32(p + 38, true) >>> 16;
    if (
      p + 46 + n + e + c > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      usize === 0xffffffff ||
      csize === 0xffffffff ||
      (mode & 0xf000) === 0xa000
    )
      throw new DomainError(
        "VALIDATION_FAILED",
        "不支持加密、链接或 ZIP64 素材",
      );
    const name = safePath(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.slice(p + 46, p + 46 + n),
      ),
    );
    if (seen.has(name.toLowerCase()))
      throw new DomainError(
        "VALIDATION_FAILED",
        "ZIP 存在重复或大小写冲突路径",
      );
    seen.add(name.toLowerCase());
    total += usize;
    if (
      total > MAX_OUTPUT ||
      usize > 20 * 1024 * 1024 ||
      usize / Math.max(csize, 1) > 200
    )
      throw new DomainError("QUOTA_EXCEEDED", "ZIP 解压容量或压缩比超限");
    if (local + 30 > start || v.getUint32(local, true) !== 0x04034b50)
      throw new DomainError("VALIDATION_FAILED", "ZIP 本地头损坏");
    const ln = v.getUint16(local + 26, true),
      le = v.getUint16(local + 28, true),
      lname = new TextDecoder().decode(
        bytes.slice(local + 30, local + 30 + ln),
      );
    if (
      lname !== name ||
      local + 30 + ln + le + csize > start ||
      v.getUint16(local + 8, true) !== method
    )
      throw new DomainError("VALIDATION_FAILED", "ZIP 文件头与目录不一致");
    entries.set(name, { size: usize, compressed: csize });
    p += 46 + n + e + c;
  }
  if (p !== end)
    throw new DomainError("VALIDATION_FAILED", "ZIP 中央目录长度错误");
  return entries;
}
export function boundedUnzip(bytes: Uint8Array, limit = MAX_OUTPUT) {
  const expected = centralEntries(bytes),
    files = new Map<string, Uint8Array>();
  let total = 0,
    failure: Error | null = null;
  const unzip = new Unzip((file) => {
    const spec = expected.get(file.name);
    if (!spec || files.has(file.name)) {
      failure = new DomainError(
        "VALIDATION_FAILED",
        "ZIP 包含未声明或重复条目",
      );
      file.terminate();
      return;
    }
    const chunks: Uint8Array[] = [];
    let count = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = err;
        file.terminate();
        return;
      }
      count += chunk.length;
      total += chunk.length;
      if (total > limit || count > spec.size) {
        failure = new DomainError("QUOTA_EXCEEDED", "实际解压输出超过额度");
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        if (count !== spec.size) {
          failure = new DomainError("VALIDATION_FAILED", "实际解压大小不一致");
          return;
        }
        const output = new Uint8Array(count);
        let p = 0;
        for (const c of chunks) {
          output.set(c, p);
          p += c.length;
        }
        files.set(file.name, output);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let p = 0; p < bytes.length; p += 65536) {
    unzip.push(
      bytes.subarray(p, Math.min(p + 65536, bytes.length)),
      p + 65536 >= bytes.length,
    );
    if (failure) throw failure;
  }
  if (files.size !== expected.size)
    throw new DomainError("VALIDATION_FAILED", "ZIP 文件未完整解压");
  return files;
}
function parseJson(bytes: Uint8Array | undefined) {
  if (!bytes || bytes.length > MAX_JSON)
    throw new DomainError("VALIDATION_FAILED", "JSON 缺失或超过 5 MiB");
  const obj: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  const depth = (v: unknown, d = 0): void => {
    if (d > 32) throw new DomainError("VALIDATION_FAILED", "JSON 嵌套过深");
    if (v && typeof v === "object")
      Object.values(v).forEach((x) => depth(x, d + 1));
  };
  depth(obj);
  return obj;
}
export async function inspectPackage(
  bytes: Uint8Array,
): Promise<PackageReport> {
  const raw = boundedUnzip(bytes),
    manifest = ManifestSchema.parse(parseJson(raw.get("manifest.json"))),
    paths = new Set<string>();
  if (
    manifest.entrypoint !==
    (manifest.packageType === "planet" ? "planet.json" : "universe.json")
  )
    throw new DomainError("VALIDATION_FAILED", "包类型与入口不一致");
  for (const f of manifest.files) {
    safePath(f.path);
    if (paths.has(f.path.toLowerCase()) || f.path === "manifest.json")
      throw new DomainError("VALIDATION_FAILED", "清单路径重复");
    paths.add(f.path.toLowerCase());
    const file = raw.get(f.path);
    if (!file) throw new DomainError("MISSING_ASSET", `缺少文件：${f.path}`);
    if (file.length !== f.byteSize || (await sha256(file)) !== f.sha256)
      throw new DomainError("HASH_MISMATCH", `文件校验失败：${f.path}`);
  }
  if (raw.size !== manifest.files.length + 1)
    throw new DomainError("VALIDATION_FAILED", "包中存在清单外文件");
  const universe =
    manifest.packageType === "universe"
      ? UniverseSchema.parse(parseJson(raw.get("universe.json")))
      : null;
  const planetPaths = universe
    ? universe.entries.map((e) => `planets/${e.planetId}.json`)
    : ["planet.json"];
  const planets = planetPaths.map((path) =>
    validatePlanet(parseJson(raw.get(path))),
  );
  const capabilities = [
    ...new Set([
      ...planets.flatMap((p) => p.requiredCapabilities),
      ...(universe?.requiredCapabilities ?? []),
    ]),
  ];
  if (
    manifest.requiredCapabilities.length !== capabilities.length ||
    capabilities.some((c) => !manifest.requiredCapabilities.includes(c))
  )
    throw new DomainError(
      "UNSUPPORTED_VERSION",
      "备份能力声明与作品或宇宙不一致",
    );
  if (
    manifest.packageVersion !==
      (universe?.schemaVersion === "1.1.0" ? "1.1.0" : VERSION) ||
    (universe?.schemaVersion === "1.1.0" &&
      !manifest.requiredCapabilities.includes(MOTION_CAPABILITY))
  )
    throw new DomainError(
      "UNSUPPORTED_VERSION",
      "运动宇宙备份需要1.1.0包版本与运动能力声明",
    );
  if (new Set(planets.map((p) => p.planetId)).size !== planets.length)
    throw new DomainError("VALIDATION_FAILED", "宇宙星球 ID 重复");
  const blobs = new Map<string, Blob>();
  for (const p of planets)
    for (const a of p.assetRefs)
      for (const f of [a.original, ...a.variants]) {
        safePath(f.path);
        const bytes = raw.get(f.path),
          entry = manifest.files.find((e) => e.path === f.path);
        if (
          !bytes ||
          !entry ||
          entry.sha256 !== f.sha256 ||
          entry.byteSize !== f.byteSize ||
          entry.mimeType !== f.mimeType
        )
          throw new DomainError("MISSING_ASSET", "素材与清单不一致");
        if (f.mimeType.startsWith("image/")) {
          const info = imageInfo(bytes);
          if (
            info.mimeType !== f.mimeType ||
            info.width !== f.width ||
            info.height !== f.height
          )
            throw new DomainError(
              "VALIDATION_FAILED",
              "图片 MIME 或尺寸与声明不符",
            );
        } else if (f.mimeType === "audio/wav") {
          if (
            new TextDecoder().decode(bytes.slice(0, 4)) !== "RIFF" ||
            new TextDecoder().decode(bytes.slice(8, 12)) !== "WAVE"
          )
            throw new DomainError("VALIDATION_FAILED", "音频格式不正确");
        } else
          throw new DomainError(
            "UNSUPPORTED_VERSION",
            "当前只支持 WAV 音频备份，MP3/OGG 待补齐",
          );
        blobs.set(
          f.path,
          new Blob([new Uint8Array(bytes)], { type: f.mimeType }),
        );
      }
  return { manifest, planets, universe, files: blobs, warnings: [] };
}
export async function exportPackage(
  planets: PlanetDocument[],
  assets: AssetStore,
  universe?: UniverseDocument,
) {
  if (universe) UniverseSchema.parse(universe);
  const zip = new JSZip(),
    data = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  for (const p of planets) {
    validatePlanet(p);
    data.set(universe ? `planets/${p.planetId}.json` : "planet.json", {
      bytes: new TextEncoder().encode(JSON.stringify(p, null, 2)),
      mimeType: "application/json",
    });
    for (const a of p.assetRefs)
      for (const f of [a.original, ...a.variants]) {
        const bytes = new Uint8Array(
          await (await assets.read(f.path)).arrayBuffer(),
        );
        if (bytes.length !== f.byteSize || (await sha256(bytes)) !== f.sha256)
          throw new DomainError(
            "HASH_MISMATCH",
            "素材存储损坏，请勿导出不完整备份",
          );
        const prior = data.get(f.path);
        if (prior && (await sha256(prior.bytes)) !== f.sha256)
          throw new DomainError("VALIDATION_FAILED", "素材路径冲突");
        data.set(f.path, { bytes, mimeType: f.mimeType });
      }
  }
  if (universe)
    data.set("universe.json", {
      bytes: new TextEncoder().encode(JSON.stringify(universe, null, 2)),
      mimeType: "application/json",
    });
  if ([...data.values()].reduce((n, f) => n + f.bytes.length, 0) > MAX_OUTPUT)
    throw new DomainError(
      "QUOTA_EXCEEDED",
      "备份超过小包上限；分批备份尚待实现，请逐个导出星球",
    );
  const manifest = {
    packageType: universe ? "universe" : "planet",
    packageVersion: universe?.schemaVersion === "1.1.0" ? "1.1.0" : VERSION,
    exportMode: "backup",
    documentType: "planet",
    exportId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    entrypoint: universe ? "universe.json" : "planet.json",
    producer: { name: "COLORVERSE", version: "0.1.0" },
    files: await Promise.all(
      [...data].map(async ([path, f]) => ({
        path,
        sha256: await sha256(f.bytes),
        byteSize: f.bytes.length,
        mimeType: f.mimeType,
      })),
    ),
    requiredCapabilities: [
      ...new Set([
        ...planets.flatMap((p) => p.requiredCapabilities),
        ...(universe?.requiredCapabilities ?? []),
      ]),
    ],
  };
  for (const [path, f] of data)
    zip.file(path, f.bytes, {
      createFolders: false,
      compression: f.mimeType === "application/json" ? "DEFLATE" : "STORE",
    });
  zip.file("manifest.json", JSON.stringify(manifest), { createFolders: false });
  const bytes = await zip.generateAsync({ type: "uint8array" });
  if (bytes.length > MAX_ZIP)
    throw new DomainError(
      "QUOTA_EXCEEDED",
      "压缩包超过 100 MiB，请减少非必要素材",
    );
  return new Blob([new Uint8Array(bytes)], { type: "application/zip" });
}
export function copyImportedPlanet(
  input: PlanetDocument,
  files: Map<string, Blob>,
) {
  const p = clone(input),
    ids = new Map<string, string>();
  const remap = (old: string) => {
    if (!ids.has(old)) ids.set(old, crypto.randomUUID());
    return ids.get(old)!;
  };
  remap(p.planetId);
  for (const a of p.assetRefs) remap(a.assetId);
  for (const a of p.archiveEntries) remap(a.id);
  for (const s of [p.exterior.scene, p.interior]) {
    remap(s.id);
    s.layers.forEach((l) => remap(l.id));
    s.tombstones.forEach(remap);
    s.hotspots.forEach((h) => remap(h.id));
  }
  for (const e of p.growthEvents) {
    remap(e.eventId);
    e.elements.forEach((el) => remap(el.layerId));
    if (e.trigger.kind === "mock") remap(e.trigger.mockSubmissionId);
  }
  const replace = (value: unknown): unknown =>
    typeof value === "string" && ids.has(value)
      ? ids.get(value)
      : Array.isArray(value)
        ? value.map(replace)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [k, replace(v)]),
            )
          : value;
  const copied = replace(p) as PlanetDocument;
  const output = new Map<string, Blob>();
  for (const a of copied.assetRefs)
    for (const f of [a.original, ...a.variants]) {
      const old = f.path,
        newPath = `assets/${a.assetId}/${old.split("/").at(-1)}`;
      const b = files.get(old);
      if (!b) throw new DomainError("MISSING_ASSET", "复制素材缺失");
      f.path = newPath;
      output.set(newPath, b);
    }
  for (const e of copied.growthEvents)
    e.trigger.idempotencyKey = `imported:${copied.planetId}:${e.eventId}`;
  copied.extensions = {
    ...copied.extensions,
    "colorverse.import": {
      sourcePlanetId: input.planetId,
      importedAt: new Date().toISOString(),
    },
  };
  copied.revision = 0;
  copied.metadata.name += " · 副本";
  return { planet: validatePlanet(copied), files: output };
}
