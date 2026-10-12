import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { LocalWorkspace } from "../apps/web/src/adapters/local/store";
import { fixturePlanet, fixtureUniverse, uid } from "@colorverse/fixtures";
import { ShowcaseService, GrowthService } from "@colorverse/application";
import {
  validatePlanet,
  dominantColor,
  showcaseChoice,
} from "@colorverse/domain";
import {
  sha256,
  imageInfo,
  exportPackage,
  inspectPackage,
  copyImportedPlanet,
} from "@colorverse/package-io";
import type { ArchiveEntry, AssetRecord } from "@colorverse/contracts";
import { GrowthPresetIds, GrowthPresets } from "@colorverse/contracts";
import { growthShapes } from "@colorverse/domain";
async function setup() {
  const p = fixturePlanet(0),
    repo = new LocalWorkspace(crypto.randomUUID()),
    files = new Map<string, Blob>();
  for (const [i, a] of p.assetRefs.entries()) {
    const bytes = new Uint8Array(
      await readFile(`apps/web/public/demo/${i === 0 ? "body" : "room"}-0.png`),
    );
    a.original.byteSize = bytes.length;
    a.original.sha256 = await sha256(bytes);
    files.set(a.original.path, new Blob([bytes], { type: "image/png" }));
  }
  await repo.importAtomic([p], fixtureUniverse([p]), files, "seed");
  const bytes = new Uint8Array(
    await readFile("apps/web/public/demo/body-1.png"),
  );
  const assetId = crypto.randomUUID(),
    path = `assets/${assetId}/original.png`;
  const asset: AssetRecord = {
    assetId,
    original: {
      ...imageInfo(bytes),
      path,
      sha256: await sha256(bytes),
      byteSize: bytes.length,
    },
    variants: [],
    rights: {
      creator: "学生",
      license: "student-original",
      source: "body.png",
      consentToPublish: false,
    },
  };
  const archive: ArchiveEntry = {
    id: crypto.randomUUID(),
    sourceType: "student",
    title: "蓝色晶体",
    createdOn: "2026-10-10",
    courseModule: "自选展示",
    description: "",
    imageAssetIds: [assetId],
    colorTags: ["#123456", "蓝色"],
  };
  return {
    p,
    repo,
    asset,
    archive,
    files: new Map([[path, new Blob([bytes], { type: "image/png" })]]),
    service: new ShowcaseService(repo, sha256),
    growth: new GrowthService(repo),
  };
}
describe("showcase archives and optional rule growth", () => {
  it("keeps thirty-four registered, bounded and visibly distinct silhouettes", () => {
    expect(GrowthPresetIds).toHaveLength(34);
    const signatures = new Set();
    for (const id of GrowthPresetIds) {
      expect(GrowthPresets[id].name).toBeTruthy();
      const shapes = growthShapes(id, 42);
      expect(shapes.length).toBeLessThanOrEqual(16);
      signatures.add(JSON.stringify(shapes));
      for (const shape of shapes) {
        const values =
          shape.kind === "poly" || shape.kind === "line"
            ? shape.points
            : [
                shape.x,
                shape.y,
                ...("radius" in shape ? [shape.radius] : [shape.rx, shape.ry]),
              ];
        expect(
          values.every((v) => Number.isFinite(v) && Math.abs(v) <= 100),
        ).toBe(true);
      }
    }
    expect(signatures.size).toBe(34);
  });
  it("rule selection reaches all registered presets without changing saved old proposals", () => {
    const choices = new Set();
    for (let i = 0; i < 256; i++) {
      const archive: ArchiveEntry = {
        ...fixturePlanet(0).archiveEntries[0],
        id: uid(40000 + i),
        title: "自由表达",
        description: "",
        colorTags: [],
      };
      choices.add(showcaseChoice(archive, []).presetId);
    }
    expect([...choices].sort()).toEqual([...GrowthPresetIds].sort());
  });
  it("persists an adjusted new preset preview without applying it; stale or foreign edits are rejected", async () => {
    const { p, repo, archive, asset, files, service, growth } = await setup();
    await service.save(p.planetId, 0, archive, asset, files);
    const event = await service.propose(p.planetId, archive.id);
    event.elements[0].presetId = "moon-mushroom";
    event.elements[0].params.scale = 0.65;
    const saved = await growth.updateProposal(event, 2);
    expect(saved.interior).toEqual(p.interior);
    expect(saved.requiredCapabilities).toContain("growth-library@1");
    expect(
      (await service.propose(p.planetId, archive.id)).elements[0].presetId,
    ).toBe("moon-mushroom");
    await expect(growth.updateProposal(event, 2)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    const foreign = structuredClone(event);
    foreign.elements[0].sceneKind = "exterior";
    await expect(
      growth.updateProposal(foreign, saved.revision),
    ).rejects.toThrow("所属场景");
    const accepted = await growth.accept(saved.growthEvents[0], saved.revision);
    await expect(
      growth.updateProposal(event, accepted.revision),
    ).rejects.toThrow("已处理");
    await repo.close();
  });
  it("requires the new capability in previews and keeps old presets compatible", async () => {
    const { p, repo, archive, asset, files, service } = await setup();
    await service.save(p.planetId, 0, archive, asset, files);
    await service.propose(p.planetId, archive.id);
    const doc = await repo.get(p.planetId);
    doc.growthEvents[0].elements[0].presetId = "luminous-leaf";
    doc.requiredCapabilities = doc.requiredCapabilities.filter(
      (c) => c !== "growth-library@1",
    );
    expect(() => validatePlanet(doc)).toThrow("growth-library@1");
    doc.growthEvents[0].elements[0].presetId = "crystal";
    expect(() => validatePlanet(doc)).not.toThrow();
    await repo.close();
  });
  it("samples opaque dominant colors with a transparent fallback", () => {
    expect(
      dominantColor(
        [255, 0, 0, 0, 10, 30, 60, 255, 14, 30, 62, 255],
        "#ffffff",
      ),
    ).toBe("#0c1e3d");
    expect(dominantColor([0, 0, 0, 0], "#ffffff")).toBe("#ffffff");
  });
  it("saves archive and original atomically without changing the scene or generating growth", async () => {
    const { p, repo, archive, asset, files, service } = await setup();
    const saved = await service.save(p.planetId, 0, archive, asset, files);
    expect(saved.interior).toEqual(p.interior);
    expect(saved.exterior).toEqual(p.exterior);
    expect(saved.growthEvents).toHaveLength(0);
    expect(saved.requiredCapabilities).toContain("showcase@1");
    expect(
      await sha256(
        new Uint8Array(
          await (await repo.read(asset.original.path)).arrayBuffer(),
        ),
      ),
    ).toBe(asset.original.sha256);
    const missingCap = structuredClone(saved);
    missingCap.requiredCapabilities = p.requiredCapabilities;
    expect(() => validatePlanet(missingCap)).toThrow("showcase@1");
    await repo.close();
  });
  it("rejects corrupt bytes before writing assets or archives", async () => {
    const { p, repo, archive, asset, files, service } = await setup();
    asset.original.sha256 = "a".repeat(64);
    await expect(
      service.save(p.planetId, 0, archive, asset, files),
    ).rejects.toThrow("校验失败");
    expect((await repo.get(p.planetId)).archiveEntries).toEqual(
      p.archiveEntries,
    );
    await expect(repo.read(asset.original.path)).rejects.toMatchObject({
      code: "MISSING_ASSET",
    });
    await repo.close();
  });
  it("rolls back a stale archive writer and refuses original path overwrites", async () => {
    const { p, repo, archive, asset, files, service } = await setup();
    await repo.save(p, 0);
    await expect(
      service.save(p.planetId, 0, archive, asset, files),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(repo.read(asset.original.path)).rejects.toMatchObject({
      code: "MISSING_ASSET",
    });
    await repo.put(files);
    await expect(
      service.save(p.planetId, 1, archive, asset, files),
    ).rejects.toThrow("不能被覆盖");
    expect((await repo.get(p.planetId)).revision).toBe(1);
    await repo.close();
  });
  it("deduplicates concurrent rule requests for the specific uploaded archive", async () => {
    const { p, repo, archive, asset, files, service } = await setup();
    await service.save(p.planetId, 0, archive, asset, files);
    expect(showcaseChoice(archive, [])).toEqual(showcaseChoice(archive, []));
    const events = await Promise.all([
      service.propose(p.planetId, archive.id),
      service.propose(p.planetId, archive.id),
    ]);
    expect(events[0].eventId).toBe(events[1].eventId);
    expect(events[0].trigger).toHaveProperty("archiveEntryId", archive.id);
    expect(events[0].provider.kind).toBe("rules");
    expect(events[0].elements[0].params.color).toBe("#123456");
    expect((await repo.get(p.planetId)).interior.layers).toHaveLength(
      p.interior.layers.length,
    );
    await repo.close();
  });
  it("skipping growth retains the archive and media and prevents regeneration", async () => {
    const { p, repo, archive, asset, files, service, growth } = await setup();
    await service.save(p.planetId, 0, archive, asset, files);
    const e = await service.propose(p.planetId, archive.id);
    const skipped = await growth.reject(p.planetId, e.eventId);
    expect(skipped.archiveEntries).toContainEqual(archive);
    expect((await service.propose(p.planetId, archive.id)).status).toBe(
      "rejected",
    );
    expect((await repo.read(asset.original.path)).size).toBe(
      asset.original.byteSize,
    );
    await repo.close();
  });
  it("accepts adjustments, then reverts only the growth layer while retaining its source", async () => {
    const { p, repo, archive, asset, files, service, growth } = await setup();
    await service.save(p.planetId, 0, archive, asset, files);
    const event = await service.propose(p.planetId, archive.id);
    event.elements[0].presetId = "star-seed";
    event.elements[0].params.scale = 0.7;
    event.elements[0].params.y = 0.3;
    const accepted = await growth.accept(event, 2);
    expect(accepted.interior.layers.at(-1)?.transform.scaleX).toBe(0.7);
    const reverted = await growth.revert(
      p.planetId,
      event.eventId,
      accepted.revision,
    );
    expect(reverted.archiveEntries).toContainEqual(archive);
    expect(reverted.interior.layers).toEqual(p.interior.layers);
    await repo.close();
  });
  it("exports originals and remaps source links on ZIP copy without duplicate growth", async () => {
    const { p, repo, archive, asset, files, service, growth } = await setup();
    await service.save(p.planetId, 0, archive, asset, files);
    const event = await service.propose(p.planetId, archive.id);
    event.elements[0].presetId = "floating-island";
    const accepted = await growth.accept(event, 2);
    const report = await inspectPackage(
      new Uint8Array(
        await (await exportPackage([accepted], repo)).arrayBuffer(),
      ),
    );
    expect(report.planets[0]).toEqual(accepted);
    const copied = copyImportedPlanet(report.planets[0], report.files);
    const other = new LocalWorkspace(crypto.randomUUID());
    await other.importAtomic(
      [copied.planet],
      fixtureUniverse([copied.planet]),
      copied.files,
      "copy",
    );
    const newArchive = copied.planet.archiveEntries.find(
      (a) => a.sourceType === "student",
    )!;
    const existing = await new ShowcaseService(other, sha256).propose(
      copied.planet.planetId,
      newArchive.id,
    );
    expect(existing.status).toBe("accepted");
    expect(existing.trigger).toHaveProperty("archiveEntryId", newArchive.id);
    expect((await other.get(copied.planet.planetId)).growthEvents).toHaveLength(
      1,
    );
    const newAsset = copied.planet.assetRefs.find(
      (a) => a.assetId === newArchive.imageAssetIds[0],
    )!;
    expect(
      await sha256(
        new Uint8Array(
          await (await other.read(newAsset.original.path)).arrayBuffer(),
        ),
      ),
    ).toBe(asset.original.sha256);
    await other.close();
    await repo.close();
  });
});
