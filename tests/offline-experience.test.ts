import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { openDB, deleteDB } from "idb";
import {
  OfflineExperienceStore,
  OFFLINE_DB_NAME,
} from "../apps/web/src/features/competition/offline-store";
import {
  CloudPlanetDocumentSchema,
  EmotionContent,
  LegacyCaseLinks,
  findEmotionCase,
  LearningIntentSchema,
} from "@colorverse/contracts";
import { readFile, stat } from "node:fs/promises";
const planet = () => ({
  id: "my-offline-planet",
  display_name: "我的创作",
  document: CloudPlanetDocumentSchema.parse({
    metadata: { name: "第一颗星球" },
  }),
  sent: 0,
  received: 0,
  visible: true,
  works: [],
});
describe("offline experience isolation and content", () => {
  it("does not import pre-anonymization identities while leaving the old experience intact", async () => {
    await deleteDB(OFFLINE_DB_NAME);
    const legacy = await openDB("colorverse-judges-offline-v1", 1, {
      upgrade(db) {
        db.createObjectStore("state");
        db.createObjectStore("media");
      },
    });
    const saved = {
      identity: { realName: "旧体验身份", studentNumber: "OLD-PRIVATE" },
    };
    await legacy.put("state", saved, "current");
    const store = new OfflineExperienceStore();
    expect((await store.load()).identity).toBeNull();
    expect(await legacy.get("state", "current")).toEqual(saved);
    await store.close();
    legacy.close();
    await deleteDB(OFFLINE_DB_NAME);
    await deleteDB("colorverse-judges-offline-v1");
  });
  it("keeps teacher and student likes separate when toggled and reopened", async () => {
    await deleteDB(OFFLINE_DB_NAME);
    let store = new OfflineExperienceStore();
    const value = {
      planetId: "demo-1",
      workId: null,
      kind: "like" as const,
      content: "",
    };
    let s = await store.interact(0, "student", value);
    s = await store.interact(s.revision, "teacher", value);
    expect(s.interactions).toHaveLength(2);
    s = await store.interact(s.revision, "student", value);
    expect(s.interactions.map((i) => i.author)).toEqual(["体验教师"]);
    await store.close();
    store = new OfflineExperienceStore();
    expect((await store.load()).interactions.map((i) => i.author)).toEqual([
      "体验教师",
    ]);
    await store.close();
    await deleteDB(OFFLINE_DB_NAME);
  });
  it("preserves media and interactions after reopen and atomically resets only this database", async () => {
    await deleteDB(OFFLINE_DB_NAME);
    const other = await openDB("colorverse-unrelated-sentinel", 1, {
      upgrade(db) {
        db.createObjectStore("keep");
      },
    });
    await other.put("keep", "untouched", "marker");
    let store = new OfflineExperienceStore();
    let s = await store.load();
    s = await store.savePlanet(
      s.revision,
      "student",
      planet(),
      new Map([["local-image", new Blob(["image"])]]),
    );
    s = await store.interact(s.revision, "student", {
      planetId: "demo-1",
      workId: null,
      kind: "comment",
      content: "来踩踩～",
    });
    await store.close();
    store = new OfflineExperienceStore();
    expect((await store.load()).interactions[0].content).toBe("来踩踩～");
    expect(await (await store.media("local-image"))!.text()).toBe("image");
    await expect(store.reset(0, "student")).rejects.toThrow("另一个窗口");
    expect((await store.load()).ownPlanet?.document.metadata.name).toBe(
      "第一颗星球",
    );
    expect(await store.media("local-image")).toBeTruthy();
    s = await store.reset(s.revision, "teacher");
    expect(s.ownPlanet).toBeNull();
    expect(s.interactions).toHaveLength(0);
    expect(await store.media("local-image")).toBeUndefined();
    expect(await other.get("keep", "marker")).toBe("untouched");
    await store.close();
    other.close();
    await deleteDB(OFFLINE_DB_NAME);
    await deleteDB("colorverse-unrelated-sentinel");
  });
  it("rejects guest writes, peer planet edits and stale concurrent writes", async () => {
    const store = new OfflineExperienceStore();
    await expect(store.savePlanet(0, "guest", planet())).rejects.toThrow(
      "游客",
    );
    await expect(
      store.savePlanet(0, "student", { ...planet(), id: "demo-1" }),
    ).rejects.toThrow("自己的星球");
    await expect(store.reset(0, "guest")).rejects.toThrow("游客");
    const results = await Promise.allSettled([
      store.savePlanet(0, "student", planet()),
      store.savePlanet(0, "student", planet()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    await store.close();
    await deleteDB(OFFLINE_DB_NAME);
  });
  it("keeps exactly 8 variable-size families and 23 stable cases with all legacy links", async () => {
    expect(EmotionContent.groups.map((g) => g.cases.length)).toEqual([
      4, 2, 2, 3, 4, 3, 2, 3,
    ]);
    const cases = EmotionContent.groups.flatMap((g) => g.cases);
    expect(cases).toHaveLength(23);
    expect(new Set(cases.map((c) => c.id)).size).toBe(23);
    expect(new Set(cases.map((c) => c.hex)).size).toBe(23);
    expect(Object.keys(LegacyCaseLinks)).toHaveLength(12);
    for (const id of Object.keys(LegacyCaseLinks))
      expect(findEmotionCase(id)).toBeTruthy();
    expect(LearningIntentSchema.parse({}).referenceCaseId).toBeUndefined();
    expect(
      LearningIntentSchema.parse({ referenceCaseId: "red-blush" })
        .referenceCaseId,
    ).toBe("red-blush");
    expect(cases.filter((c) => c.image.status === "ready")).toHaveLength(23);
    for (const c of cases) {
      for (const value of [
        c.observation,
        c.scene,
        c.suggestion,
        c.question,
        c.prompt,
      ])
        expect(value.length).toBeGreaterThan(3);
      if (c.image.status === "ready") {
        expect(
          (await stat("apps/web/public/" + c.image.path)).size,
        ).toBeLessThan(800000);
        expect(
          (await stat("apps/web/public/" + c.image.thumbnail)).size,
        ).toBeLessThan(150000);
      } else expect(c.image.status).toBe("placeholder");
    }
    const record = JSON.parse(
      await readFile(
        "apps/web/public/emotion-cases/resource-record.json",
        "utf8",
      ),
    );
    expect(record.resources).toHaveLength(23);
  });
});
