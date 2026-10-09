import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { fixturePlanet, fixtureUniverse, uid } from "@colorverse/fixtures";
import { restoreScene } from "@colorverse/domain";
import { GrowthService } from "@colorverse/application";
import { LocalWorkspace } from "../apps/web/src/adapters/local/store";
describe("scene reset without losing authorship or growth", () => {
  it("restores only the selected scene and keeps text, palette, revision and original assets", () => {
    const original = fixturePlanet(0),
      edited = structuredClone(original);
    edited.exterior.scene.layers[0].transform.x = 1100;
    edited.exterior.scene.background = { type: "color", color: "#667799" };
    edited.metadata.description = "新独白";
    edited.revision = 12;
    edited.interior.background = { type: "color", color: "#884455" };
    const reset = restoreScene(edited, original, "exterior");
    expect(reset.exterior.scene).toEqual(original.exterior.scene);
    expect(reset.interior).toEqual(edited.interior);
    expect(reset.metadata).toEqual(edited.metadata);
    expect(reset.revision).toBe(12);
    expect(reset.assetRefs).toEqual(edited.assetRefs);
    expect(restoreScene(edited, original, "interior").exterior).toEqual(
      edited.exterior,
    );
  });
  it("keeps accepted growth when restoring the initial interior", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0),
      service = new GrowthService(repo);
    await repo.importAtomic([p], fixtureUniverse([p]), new Map(), "seed");
    const event = await service.propose(p.planetId, uid(9900));
    const grown = await service.accept(event, 1),
      reset = restoreScene(grown, p, "interior");
    expect(reset.growthEvents).toEqual(grown.growthEvents);
    expect(reset.interior.layers).toEqual(grown.interior.layers);
    await repo.close();
  });
  it("does not revive reverted growth from an older snapshot", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0),
      service = new GrowthService(repo);
    await repo.importAtomic([p], fixtureUniverse([p]), new Map(), "seed");
    const event = await service.propose(p.planetId, uid(9900)),
      grown = await service.accept(event, 1);
    const reverted = await service.revert(
      p.planetId,
      event.eventId,
      grown.revision,
    );
    expect(
      restoreScene(reverted, grown, "interior").interior.layers,
    ).toHaveLength(0);
    await repo.close();
  });
});
