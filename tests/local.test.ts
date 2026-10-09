import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { LocalWorkspace } from "../apps/web/src/adapters/local/store";
import { fixturePlanet, fixtureUniverse } from "@colorverse/fixtures";
describe("local transaction contract", () => {
  it("persists revisions and rejects a stale writer", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0);
    await repo.importAtomic([p], fixtureUniverse([p]), new Map(), "seed");
    const saved = await repo.save(p, 0);
    expect(saved.revision).toBe(1);
    await expect(repo.save(p, 0)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    expect((await repo.get(p.planetId)).revision).toBe(1);
    expect((await repo.getBaseline(p.planetId)).revision).toBe(0);
    await repo.close();
  });
  it("deduplicates an import and preserves hidden entries", async () => {
    const repo = new LocalWorkspace(crypto.randomUUID()),
      p = fixturePlanet(0),
      u = fixtureUniverse([p]);
    u.entries[0].visible = false;
    expect(await repo.importAtomic([p], u, new Map(), "same")).toBe(true);
    expect(await repo.importAtomic([p], u, new Map(), "same")).toBe(false);
    expect((await repo.getUniverse()).entries[0].visible).toBe(false);
    await repo.close();
  });
});
