import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { fixturePlanet, fixtureUniverse } from "@colorverse/fixtures";
import {
  GrowthService,
  GrowthElementService,
  ShowcaseService,
} from "@colorverse/application";
import {
  updateGrowthElement,
  validatePlanet,
  findArchiveGrowthElement,
} from "@colorverse/domain";
import { LocalWorkspace } from "../apps/web/src/adapters/local/store";
import { GrowthParamsSchema, type Layer } from "@colorverse/contracts";
const student = { role: "student" as const, userId: "owner" };
const teacher = { role: "teacher" as const, userId: "teacher" };
async function setup() {
  const databaseName = crypto.randomUUID(),
    repo = new LocalWorkspace(databaseName),
    p = fixturePlanet(0);
  const archive = {
    ...p.archiveEntries[0],
    id: crypto.randomUUID(),
    sourceType: "student" as const,
    title: "小小的蓝色森林",
  };
  p.archiveEntries.push(archive);
  p.requiredCapabilities.push("showcase@1");
  await repo.importAtomic([p], fixtureUniverse([p]), new Map(), "seed");
  await repo.assignOwner(p.planetId, student.userId);
  const showcase = new ShowcaseService(repo, async () => "unused");
  const result = await showcase.grow(p.planetId, archive.id);
  const layer = result.document.interior.layers.find(
    (l) => l.id === result.event.elements[0].layerId,
  )!;
  return {
    databaseName,
    repo,
    p,
    archive,
    showcase,
    ...result,
    layer,
    service: new GrowthElementService(repo),
  };
}
describe("artwork-first element navigation", () => {
  it("resolves the same artwork element after its shape is edited, without changing source history", async () => {
    const { repo, document, archive, layer } = await setup();
    const edited = updateGrowthElement(document, change(layer));
    expect(
      findArchiveGrowthElement(edited, archive.id, layer.id)?.source,
    ).toMatchObject({
      presetId: "moon-mushroom",
      params: { color: "#abcdef", scale: 0.7 },
    });
    expect(findArchiveGrowthElement(edited, archive.id)?.id).toBe(layer.id);
    expect(edited.growthEvents).toEqual(document.growthEvents);
    await repo.close();
  });
  it("never falls back to another work when a requested element is missing or belongs elsewhere", async () => {
    const { repo, document, archive, layer } = await setup();
    expect(
      findArchiveGrowthElement(
        document,
        document.archiveEntries[0].id,
        layer.id,
      ),
    ).toBeUndefined();
    expect(
      findArchiveGrowthElement(document, archive.id, "missing-layer"),
    ).toBeUndefined();
    expect(
      findArchiveGrowthElement(document, "missing-archive", layer.id),
    ).toBeUndefined();
    await repo.close();
  });
  it("hides editing for reverted growth or removed layers while retaining the artwork", async () => {
    const { repo, document, archive, layer } = await setup();
    const missing = structuredClone(document);
    missing.interior.layers = missing.interior.layers.filter(
      (l) => l.id !== layer.id,
    );
    expect(findArchiveGrowthElement(missing, archive.id)).toBeUndefined();
    const reverted = structuredClone(document);
    reverted.growthEvents[0].status = "reverted";
    expect(findArchiveGrowthElement(reverted, archive.id)).toBeUndefined();
    expect(reverted.archiveEntries).toEqual(document.archiveEntries);
    await repo.close();
  });
});
function change(layer: Layer) {
  const draft = structuredClone(layer);
  draft.transform.x = 600;
  draft.transform.y = 300;
  draft.transform.scaleX = draft.transform.scaleY = 0.7;
  draft.adjustments.saturation = 0.6;
  draft.animation = [{ type: "float", amplitudePx: 12, periodSec: 8 }];
  if ("presetId" in draft.source && draft.source.presetId !== "sphere") {
    draft.source.presetId = "moon-mushroom";
    draft.source.params.color = "#abcdef";
    draft.source.params.particleStyle = "stardust";
  }
  return draft;
}
describe("automatic growth and isolated element editing", () => {
  it("automatically accepts one small element with its immutable archive source", async () => {
    const s = await setup();
    expect(s.created).toBe(true);
    expect(s.event.status).toBe("accepted");
    expect(s.layer.transform.scaleX).toBe(0.45);
    expect(s.document.interior.layers).toHaveLength(
      s.p.interior.layers.length + 1,
    );
    expect(s.document.archiveEntries).toEqual(s.p.archiveEntries);
    expect(s.document.exterior).toEqual(s.p.exterior);
    expect(s.event.trigger).toMatchObject({
      kind: "archive",
      archiveEntryId: s.archive.id,
    });
  });
  it("reopening or retrying the same work never adds a layer or revision", async () => {
    const s = await setup(),
      result = await s.showcase.grow(s.p.planetId, s.archive.id);
    expect(result.created).toBe(false);
    expect(result.document).toEqual(s.document);
  });
  it("changes only the accepted layer and adds explicit optional capabilities", async () => {
    const s = await setup(),
      next = updateGrowthElement(s.document, change(s.layer));
    expect(next.growthEvents).toEqual(s.document.growthEvents);
    expect(next.archiveEntries).toEqual(s.document.archiveEntries);
    expect(next.assetRefs).toEqual(s.document.assetRefs);
    expect(next.exterior).toEqual(s.document.exterior);
    expect(next.interior.background).toEqual(s.document.interior.background);
    expect(next.interior.hotspots).toEqual(s.document.interior.hotspots);
    expect(next.interior.layers.filter((l) => l.id !== s.layer.id)).toEqual(
      s.p.interior.layers,
    );
    expect(next.requiredCapabilities).toContain("growth-particles@1");
    const layer = next.interior.layers.find((l) => l.id === s.layer.id)!;
    expect(layer.source).toMatchObject({
      presetId: "moon-mushroom",
      params: {
        x: 600 / 1600,
        y: 300 / 900,
        scale: 0.7,
        particleStyle: "stardust",
      },
    });
    expect(s.document.interior.layers.find((l) => l.id === s.layer.id)).toEqual(
      s.layer,
    );
  });
  it("atomically saves the owner's edit with a revision and permits teachers", async () => {
    const s = await setup();
    const saved = await s.service.save(
      s.p.planetId,
      change(s.layer),
      s.document.revision,
      student,
    );
    expect(saved.revision).toBe(s.document.revision + 1);
    expect(await s.repo.get(s.p.planetId)).toEqual(saved);
    const next = await s.service.save(
      s.p.planetId,
      change(s.layer),
      saved.revision,
      teacher,
    );
    expect(next.revision).toBe(saved.revision + 1);
  });
  it("rejects other students and unknown roles without changing the document", async () => {
    const s = await setup();
    await expect(
      s.service.save(s.p.planetId, change(s.layer), s.document.revision, {
        role: "student",
        userId: "other",
      }),
    ).rejects.toThrow();
    await expect(
      s.repo.updateElement(s.p.planetId, change(s.layer), s.document.revision, {
        role: "visitor" as "student",
        userId: student.userId,
      }),
    ).rejects.toThrow();
    expect(await s.repo.get(s.p.planetId)).toEqual(s.document);
  });
  it("rechecks ownership inside the write transaction", async () => {
    const s = await setup();
    const service = new GrowthElementService({
      getPlanetOwner: async () => student.userId,
      updateElement: async (...args) => {
        const db = await openDB(s.databaseName);
        await db.put("ownership", "new-owner", s.p.planetId);
        db.close();
        return s.repo.updateElement(...args);
      },
    });
    await expect(
      service.save(s.p.planetId, change(s.layer), s.document.revision, student),
    ).rejects.toThrow();
    expect(await s.repo.get(s.p.planetId)).toEqual(s.document);
  });
  it("allows one concurrent writer and preserves the other draft", async () => {
    const s = await setup(),
      draft = change(s.layer);
    const results = await Promise.allSettled([
      s.service.save(s.p.planetId, draft, s.document.revision, student),
      s.service.save(s.p.planetId, draft, s.document.revision, student),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(draft).toEqual(change(s.layer));
    expect((await s.repo.get(s.p.planetId)).revision).toBe(
      s.document.revision + 1,
    );
  });
  it("blocks identity, seed, environment-layer and out-of-bounds changes", async () => {
    const s = await setup();
    for (const mutate of [
      (l: Layer) => {
        l.depth = "background";
      },
      (l: Layer) => {
        l.visible = false;
      },
      (l: Layer) => {
        l.transform.x = -1;
      },
      (l: Layer) => {
        l.transform.scaleY = 0.8;
      },
      (l: Layer) => {
        l.id = crypto.randomUUID();
      },
      (l: Layer) => {
        if ("presetId" in l.source && l.source.presetId !== "sphere")
          l.source.params.seed++;
      },
    ]) {
      const draft = change(s.layer);
      mutate(draft);
      expect(() => updateGrowthElement(s.document, draft)).toThrow();
    }
    expect(() =>
      updateGrowthElement(s.document, s.document.exterior.scene.layers[0]),
    ).toThrow();
  });
  it("rejects undeclared particles and arbitrary particle names", async () => {
    const s = await setup(),
      doc = updateGrowthElement(s.document, change(s.layer));
    doc.requiredCapabilities = doc.requiredCapabilities.filter(
      (c) => c !== "growth-particles@1",
    );
    expect(() => validatePlanet(doc)).toThrow("growth-particles@1");
    const source = change(s.layer).source;
    if ("presetId" in source && source.presetId !== "sphere")
      expect(
        GrowthParamsSchema.safeParse({
          ...source.params,
          particleStyle: "arbitrary",
        }).success,
      ).toBe(false);
  });
  it("compensates an edited element without deleting its source work", async () => {
    const s = await setup();
    const edited = await s.service.save(
      s.p.planetId,
      change(s.layer),
      s.document.revision,
      student,
    );
    const reverted = await new GrowthService(s.repo).revert(
      s.p.planetId,
      s.event.eventId,
      edited.revision,
    );
    expect(reverted.interior.layers).toEqual(s.p.interior.layers);
    expect(reverted.archiveEntries).toEqual(s.p.archiveEntries);
    expect((await s.showcase.grow(s.p.planetId, s.archive.id)).created).toBe(
      false,
    );
    await expect(
      s.service.save(s.p.planetId, change(s.layer), reverted.revision, student),
    ).rejects.toThrow();
  });
  it("retains the work and proposed event when growth fails, then retries once", async () => {
    const s = await setup(),
      doc = await s.repo.get(s.p.planetId);
    const archive = { ...s.archive, id: crypto.randomUUID() };
    doc.archiveEntries.push(archive);
    const saved = await s.repo.save(doc, doc.revision);
    let blocked = true;
    const flaky = new ShowcaseService(
      {
        get: (id) => s.repo.get(id),
        list: () => s.repo.list(),
        saveWithAssets: (...a) => s.repo.saveWithAssets(...a),
        save: async (d, r) => {
          if (blocked && d.growthEvents.at(-1)?.status === "accepted")
            throw new Error("storage full");
          return s.repo.save(d, r);
        },
      },
      async () => "unused",
    );
    await expect(flaky.grow(s.p.planetId, archive.id)).rejects.toThrow(
      "storage full",
    );
    const failed = await s.repo.get(s.p.planetId);
    expect(failed.archiveEntries).toEqual(saved.archiveEntries);
    expect(failed.growthEvents.at(-1)?.status).toBe("proposed");
    blocked = false;
    const recovered = await flaky.grow(s.p.planetId, archive.id);
    expect(recovered.document.growthEvents.at(-1)?.status).toBe("accepted");
    expect(recovered.document.interior.layers).toHaveLength(
      s.document.interior.layers.length + 1,
    );
  });
  it("preserves the 25th work when the existing 24-growth budget is reached", async () => {
    const s = await setup();
    for (let i = 1; i < 24; i++) {
      const doc = await s.repo.get(s.p.planetId),
        archive = { ...s.archive, id: crypto.randomUUID() };
      doc.archiveEntries.push(archive);
      await s.repo.save(doc, doc.revision);
      await s.showcase.grow(s.p.planetId, archive.id);
    }
    const doc = await s.repo.get(s.p.planetId),
      archive = { ...s.archive, id: crypto.randomUUID() };
    doc.archiveEntries.push(archive);
    await s.repo.save(doc, doc.revision);
    await expect(s.showcase.grow(s.p.planetId, archive.id)).rejects.toThrow(
      "上限",
    );
    const saved = await s.repo.get(s.p.planetId);
    expect(saved.archiveEntries.some((a) => a.id === archive.id)).toBe(true);
    expect(saved.interior.layers).toHaveLength(s.p.interior.layers.length + 24);
    expect(saved.growthEvents.at(-1)?.status).toBe("proposed");
  });
  it("deduplicates two simultaneous automatic generation requests", async () => {
    const s = await setup(),
      doc = await s.repo.get(s.p.planetId),
      archive = { ...s.archive, id: crypto.randomUUID() };
    doc.archiveEntries.push(archive);
    await s.repo.save(doc, doc.revision);
    const results = await Promise.allSettled([
      s.showcase.grow(s.p.planetId, archive.id),
      s.showcase.grow(s.p.planetId, archive.id),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const saved = await s.repo.get(s.p.planetId);
    expect(
      saved.growthEvents.filter(
        (e) =>
          e.trigger.kind === "archive" &&
          e.trigger.archiveEntryId === archive.id,
      ),
    ).toHaveLength(1);
    expect(saved.interior.layers).toHaveLength(
      s.document.interior.layers.length + 1,
    );
    expect((await s.showcase.grow(s.p.planetId, archive.id)).document).toEqual(
      saved,
    );
  });
});
