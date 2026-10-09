import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { LocalWorkspace } from "../apps/web/src/adapters/local/store";
import { fixturePlanet, fixtureUniverse, uid } from "@colorverse/fixtures";
import { GrowthService } from "@colorverse/application";
async function setup() {
  const name = crypto.randomUUID(),
    repo = new LocalWorkspace(name),
    p = fixturePlanet(0);
  await repo.importAtomic([p], fixtureUniverse([p]), new Map(), "seed");
  return { repo, p, name, service: new GrowthService(repo) };
}
describe("growth lifecycle", () => {
  it("deduplicates a trigger, atomically applies and reloads an independent layer", async () => {
    const { repo, p, name, service } = await setup();
    const e = await service.propose(p.planetId, uid(9900));
    expect((await service.propose(p.planetId, uid(9900))).eventId).toBe(
      e.eventId,
    );
    const revision = (await repo.get(p.planetId)).revision;
    const results = await Promise.allSettled([
      service.accept(e, revision),
      service.accept(e, revision),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const saved = await repo.get(p.planetId);
    expect(saved.interior.layers).toHaveLength(1);
    expect(saved.growthEvents).toHaveLength(1);
    await repo.close();
    const reloaded = new LocalWorkspace(name);
    expect((await reloaded.get(p.planetId)).growthEvents[0].status).toBe(
      "accepted",
    );
    await reloaded.close();
  });
  it("rejects without adding layers", async () => {
    const { repo, p, service } = await setup(),
      e = await service.propose(p.planetId, uid(9900));
    await service.reject(p.planetId, e.eventId);
    expect((await repo.get(p.planetId)).interior.layers).toHaveLength(0);
    await expect(service.accept(e, 1)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await repo.close();
  });
  it("compensates only its own layers while preserving manual changes", async () => {
    const { repo, p, service } = await setup(),
      e = await service.propose(p.planetId, uid(9900));
    let doc = await service.accept(e, 1);
    doc.metadata.description = "手动写的新故事";
    doc = await repo.save(doc, doc.revision);
    const reverted = await service.revert(p.planetId, e.eventId, doc.revision);
    expect(reverted.metadata.description).toBe("手动写的新故事");
    expect(reverted.interior.layers).toHaveLength(0);
    expect(reverted.interior.tombstones).toContain(e.elements[0].layerId);
    expect(
      (await service.revert(p.planetId, e.eventId, reverted.revision)).revision,
    ).toBe(reverted.revision);
    await repo.close();
  });
  it("rejects stale revisions and invalid parameters before writes", async () => {
    const { repo, p, service } = await setup(),
      e = await service.propose(p.planetId, uid(9900));
    await expect(service.accept(e, 0)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    e.elements[0].params.x = 2;
    await expect(service.accept(e, 1)).rejects.toThrow();
    expect((await repo.get(p.planetId)).interior.layers).toHaveLength(0);
    await repo.close();
  });
});
