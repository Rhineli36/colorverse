import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { fixturePlanet, fixtureUniverse } from "@colorverse/fixtures";
import { createDecoration } from "@colorverse/domain";
import {
  exportPackage,
  inspectPackage,
  sha256,
  imageInfo,
  boundedUnzip,
  safePath,
  copyImportedPlanet,
} from "@colorverse/package-io";
async function sample() {
  const p = fixturePlanet(0),
    files = new Map<string, Blob>();
  for (const [i, a] of p.assetRefs.entries()) {
    const bytes = new Uint8Array(
      await readFile(`apps/web/public/demo/${i === 0 ? "body" : "room"}-0.png`),
    );
    a.original.byteSize = bytes.length;
    a.original.sha256 = await sha256(bytes);
    files.set(a.original.path, new Blob([bytes], { type: "image/png" }));
  }
  return {
    p,
    files,
    assets: {
      read: async (path: string) => {
        const file = files.get(path);
        if (!file) throw new Error("missing");
        return file;
      },
      put: async () => {},
      resolve: async () => new Blob(),
    },
  };
}
describe("media and portable packages", () => {
  it("round-trips a crop and declares its capability while preserving the original bytes", async () => {
    const { p, files, assets } = await sample();
    const layer = p.exterior.scene.layers[0];
    if ("assetId" in layer.source)
      layer.source.crop = { x: 0.15, y: 0.1, width: 0.7, height: 0.8 };
    p.requiredCapabilities.push("image-crop@1");
    const blob = await exportPackage([p], assets),
      bytes = new Uint8Array(await blob.arrayBuffer());
    const report = await inspectPackage(bytes);
    expect(report.planets[0]).toEqual(p);
    const zip = await JSZip.loadAsync(bytes),
      manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest.requiredCapabilities).toContain("image-crop@1");
    for (const [path, file] of files)
      expect(await report.files.get(path)!.arrayBuffer()).toEqual(
        await file.arrayBuffer(),
      );
    const copied = copyImportedPlanet(report.planets[0], report.files);
    expect(copied.planet.exterior.scene.layers[0].source).toHaveProperty(
      "crop.width",
      0.7,
    );
  });
  it("round-trips satellite parameters and decorative layers without altering original files", async () => {
    const { p, files, assets } = await sample();
    p.requiredCapabilities.push("effects@1", "decorations@1");
    for (const id of ["satellite", "halo", "rim-light"] as const)
      p.exterior.scene.layers.push(
        createDecoration(
          id,
          p.exterior.scene,
          "#DDCCFF",
          crypto.randomUUID(),
          123,
        ),
      );
    const satellite = p.exterior.scene.layers[1];
    if ("effectId" in satellite.source)
      satellite.source.params.satelliteCount = 3;
    const blob = await exportPackage([p], assets),
      report = await inspectPackage(new Uint8Array(await blob.arrayBuffer()));
    expect(report.planets[0]).toEqual(p);
    const copy = copyImportedPlanet(report.planets[0], report.files);
    expect(
      copy.planet.exterior.scene.layers
        .slice(1)
        .map((l) => ("effectId" in l.source ? l.source.params : null)),
    ).toEqual(
      p.exterior.scene.layers
        .slice(1)
        .map((l) => ("effectId" in l.source ? l.source.params : null)),
    );
    for (const l of copy.planet.exterior.scene.layers.slice(1))
      if ("effectId" in l.source)
        expect(l.source.anchorLayerId).toBe(
          copy.planet.exterior.scene.layers[0].id,
        );
    for (const [path, bytes] of files)
      expect(await report.files.get(path)!.arrayBuffer()).toEqual(
        await bytes.arrayBuffer(),
      );
  });
  it("parses all 10 PNG/JPEG/WebP fixtures before decoding", async () => {
    for (let i = 0; i < 10; i++) {
      const ext = ["png", "jpg", "webp"][i % 3],
        bytes = new Uint8Array(
          await readFile(`tests/fixtures/media/sample-${i}.${ext}`),
        );
      expect(imageInfo(bytes).width).toBe(i === 9 ? 2048 : 512);
    }
  });
  it("rejects disguised and oversized images", () => {
    expect(() => imageInfo(new TextEncoder().encode("<svg></svg>"))).toThrow();
    const b = new Uint8Array(24);
    b.set([137, 80, 78, 71, 13, 10, 26, 10]);
    new DataView(b.buffer).setUint32(16, 9000);
    new DataView(b.buffer).setUint32(20, 9000);
    expect(() => imageInfo(b)).toThrow("尺寸");
  });
  it("round-trips original bytes and metadata in a standalone ZIP", async () => {
    const { p, files, assets } = await sample(),
      blob = await exportPackage([p], assets),
      report = await inspectPackage(new Uint8Array(await blob.arrayBuffer()));
    expect(report.planets[0]).toEqual(p);
    for (const [path, b] of files)
      expect(await report.files.get(path)!.arrayBuffer()).toEqual(
        await b.arrayBuffer(),
      );
    const copy = copyImportedPlanet(report.planets[0], report.files);
    expect(copy.planet.planetId).not.toBe(p.planetId);
    expect(copy.files.size).toBe(2);
  });
  it("restores hidden universe entries", async () => {
    const { p, assets } = await sample(),
      u = fixtureUniverse([p]);
    u.entries[0].visible = false;
    const zip = await exportPackage([p], assets, u),
      report = await inspectPackage(new Uint8Array(await zip.arrayBuffer()));
    expect(report.universe).toEqual(u);
  });
  it("rejects path traversal and case collisions before extraction", async () => {
    expect(() => safePath("../x")).toThrow();
    const zip = new JSZip();
    zip.file("A.json", "x", { createFolders: false });
    zip.file("a.json", "y", { createFolders: false });
    expect(() => boundedUnzip(new Uint8Array())).toThrow();
    const bytes = await zip.generateAsync({ type: "uint8array" });
    expect(() => boundedUnzip(bytes)).toThrow("冲突");
  });
  it("enforces actual output budget independently from declared size", async () => {
    const zip = new JSZip();
    zip.file("planet.json", "small file", { createFolders: false });
    const bytes = await zip.generateAsync({ type: "uint8array" });
    expect(() => boundedUnzip(bytes, 3)).toThrow("实际解压");
  });
  it("rejects tampered bytes and missing media without returning a report", async () => {
    const { p, assets } = await sample(),
      blob = await exportPackage([p], assets),
      zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.file(p.assetRefs[0].original.path, "corrupt", { createFolders: false });
    await expect(
      inspectPackage(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toMatchObject({ code: "HASH_MISMATCH" });
    zip.remove(p.assetRefs[0].original.path);
    await expect(
      inspectPackage(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toMatchObject({ code: "MISSING_ASSET" });
  });
});
