import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  PlanetDocument,
  UniverseDocument,
  AssetRecord,
  Layer,
} from "@colorverse/contracts";
import type { WorkspaceRepository, AssetStore } from "@colorverse/application";
import {
  validatePlanet,
  DomainError,
  assertPlanetMove,
  upgradeUniverse,
  updateGrowthElement,
  type LayoutActor,
} from "@colorverse/domain";
import { UniverseSchema, MotionSchema } from "@colorverse/contracts";
import type { PlanetMove, PlanetMotionChange } from "@colorverse/application";
interface WorkspaceDB extends DBSchema {
  planets: { key: string; value: PlanetDocument };
  revisions: { key: string; value: PlanetDocument };
  assets: { key: string; value: Blob };
  universes: { key: string; value: UniverseDocument };
  imports: { key: string; value: boolean };
  ownership: { key: string; value: string };
  settings: { key: string; value: boolean };
}
export class LocalWorkspace implements WorkspaceRepository, AssetStore {
  private db: Promise<IDBPDatabase<WorkspaceDB>>;
  constructor(name = "colorverse-v1") {
    this.db = openDB<WorkspaceDB>(name, 2, {
      upgrade(db) {
        for (const name of [
          "planets",
          "revisions",
          "assets",
          "universes",
          "imports",
          "ownership",
          "settings",
        ] as const)
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      },
    });
  }
  async get(id: string) {
    const result = await (await this.db).get("planets", id);
    if (!result) throw new DomainError("NOT_FOUND", "星球不存在");
    return result;
  }
  async list() {
    return (await this.db).getAll("planets");
  }
  async getBaseline(id: string) {
    const versions = await (
      await this.db
    ).getAll("revisions", IDBKeyRange.bound(`${id}:`, `${id}:\uffff`));
    return versions.sort((a, b) => a.revision - b.revision)[0] ?? this.get(id);
  }
  async save(doc: PlanetDocument, expected: number) {
    const valid = validatePlanet(doc),
      db = await this.db,
      tx = db.transaction(["planets", "revisions"], "readwrite"),
      current = await tx.objectStore("planets").get(doc.planetId);
    if ((current?.revision ?? 0) !== expected) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new DomainError(
        "REVISION_CONFLICT",
        "另一个窗口已修改星球。请导出当前草稿，再重新打开星球。",
      );
    }
    const saved = { ...valid, revision: expected + 1 };
    await tx.objectStore("planets").put(saved, saved.planetId);
    await tx
      .objectStore("revisions")
      .put(saved, `${saved.planetId}:${saved.revision}`);
    await tx.done;
    return saved;
  }
  async getUniverse() {
    const u = (await (await this.db).getAll("universes"))[0];
    if (!u) throw new DomainError("NOT_FOUND", "宇宙尚未初始化");
    return UniverseSchema.parse(u);
  }
  async updateElement(
    planetId: string,
    layer: Layer,
    revision: number,
    actor: LayoutActor,
  ) {
    const tx = (await this.db).transaction(
      ["ownership", "planets", "revisions"],
      "readwrite",
    );
    try {
      assertPlanetMove(
        actor,
        (await tx.objectStore("ownership").get(planetId)) ?? null,
      );
      const current = await tx.objectStore("planets").get(planetId);
      if (!current || current.revision !== revision)
        throw new DomainError(
          "REVISION_CONFLICT",
          "另一个窗口已修改星球，请保留调整并重新打开元素",
        );
      const saved = {
        ...updateGrowthElement(current, layer),
        revision: revision + 1,
      };
      await tx.objectStore("planets").put(saved, planetId);
      await tx
        .objectStore("revisions")
        .put(saved, `${planetId}:${saved.revision}`);
      await tx.done;
      return saved;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already closed */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async saveWithAssets(
    doc: PlanetDocument,
    expected: number,
    files: Map<string, Blob>,
  ) {
    const valid = validatePlanet(doc),
      db = await this.db;
    const tx = db.transaction(["planets", "revisions", "assets"], "readwrite");
    try {
      const current = await tx.objectStore("planets").get(doc.planetId);
      if (!current || current.revision !== expected)
        throw new DomainError(
          "REVISION_CONFLICT",
          "另一个窗口已修改星球，请重新打开后保存作品",
        );
      for (const [path, blob] of files) {
        if (await tx.objectStore("assets").get(path))
          throw new DomainError("VALIDATION_FAILED", "原始素材不能被覆盖");
        await tx.objectStore("assets").put(blob, path);
      }
      const saved = { ...valid, revision: expected + 1 };
      await tx.objectStore("planets").put(saved, saved.planetId);
      await tx
        .objectStore("revisions")
        .put(saved, `${saved.planetId}:${saved.revision}`);
      await tx.done;
      return saved;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already aborted. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async saveUniverse(u: UniverseDocument) {
    const valid = UniverseSchema.parse(u),
      tx = (await this.db).transaction("universes", "readwrite");
    try {
      const current = await tx.store.get(u.universeId);
      if (!current) {
        await tx.store.put(valid, u.universeId);
        await tx.done;
        return;
      }
      // Full-layout management must not overwrite a newer motion or drag command.
      for (const before of current.entries) {
        const next = valid.entries.find((e) => e.planetId === before.planetId);
        if (
          !next ||
          (before.layoutRevision ?? 0) !== (next.layoutRevision ?? 0) ||
          JSON.stringify([before.position, before.motion]) !==
            JSON.stringify([next.position, next.motion])
        )
          throw new DomainError(
            "LAYOUT_CONFLICT",
            "另一个窗口已修改宇宙，请刷新后重试。",
          );
      }
      const saved = upgradeUniverse(valid);
      for (const e of saved.entries) {
        const before = current.entries.find((p) => p.planetId === e.planetId);
        if (
          before &&
          JSON.stringify([before.visible, before.scale, before.order]) !==
            JSON.stringify([e.visible, e.scale, e.order])
        )
          e.layoutRevision++;
      }
      await tx.store.put(saved, u.universeId);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already closed. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async getPlanetOwner(id: string) {
    return (await (await this.db).get("ownership", id)) ?? null;
  }
  async getOwnership() {
    const tx = (await this.db).transaction("ownership"),
      keys = await tx.store.getAllKeys(),
      owners = await tx.store.getAll();
    return Object.fromEntries(keys.map((key, i) => [key, owners[i]]));
  }
  async assignOwner(planetId: string, userId: string) {
    const tx = (await this.db).transaction("ownership", "readwrite");
    if (!(await tx.store.get(planetId))) await tx.store.put(userId, planetId);
    await tx.done;
  }
  async movePlanet(move: PlanetMove, actor: LayoutActor) {
    await this.updateLayout(move, actor);
  }
  async configurePlanetMotion(change: PlanetMotionChange, actor: LayoutActor) {
    await this.updateLayout(
      { ...change, motion: MotionSchema.parse(change.motion) },
      actor,
    );
  }
  private async updateLayout(
    move: PlanetMove | PlanetMotionChange,
    actor: LayoutActor,
  ) {
    if (!Number.isFinite(move.position.x) || !Number.isFinite(move.position.y))
      throw new Error("星球位置必须是有限坐标。");
    const tx = (await this.db).transaction(
      ["ownership", "universes"],
      "readwrite",
    );
    try {
      assertPlanetMove(
        actor,
        (await tx.objectStore("ownership").get(move.planetId)) ?? null,
      );
      const stored = await tx.objectStore("universes").get(move.universeId);
      const universe = stored ? upgradeUniverse(stored) : null;
      const entry = universe?.entries.find((e) => e.planetId === move.planetId);
      if (!universe || !entry || !entry.visible)
        throw new DomainError("NOT_FOUND", "星球已隐藏或离开当前宇宙。");
      if (
        entry.layoutRevision !== move.expectedLayoutRevision ||
        ("expectedPosition" in move &&
          (entry.position.x !== move.expectedPosition.x ||
            entry.position.y !== move.expectedPosition.y))
      )
        throw new DomainError(
          "LAYOUT_CONFLICT",
          "另一个窗口已修改这颗星球的运动或位置，请刷新宇宙后重试。",
        );
      entry.position = { ...move.position };
      if ("motion" in move) entry.motion = MotionSchema.parse(move.motion);
      entry.layoutRevision++;
      await tx
        .objectStore("universes")
        .put(UniverseSchema.parse(universe), universe.universeId);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* transaction may already be aborted */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async migrateDemoLayout(
    positions: {
      planetId: string;
      before: { x: number; y: number };
      after: { x: number; y: number };
    }[],
  ) {
    const tx = (await this.db).transaction(
      ["universes", "settings"],
      "readwrite",
    );
    if (!(await tx.objectStore("settings").get("spatial-demo-v2"))) {
      const u = (await tx.objectStore("universes").getAll())[0];
      if (u) {
        for (const item of positions) {
          const entry = u.entries.find((e) => e.planetId === item.planetId);
          if (
            entry &&
            entry.position.x === item.before.x &&
            entry.position.y === item.before.y
          )
            entry.position = { ...item.after };
        }
        await tx.objectStore("universes").put(u, u.universeId);
      }
      await tx.objectStore("settings").put(true, "spatial-demo-v2");
    }
    await tx.done;
  }
  async read(path: string) {
    const b = await (await this.db).get("assets", path);
    if (!b) throw new DomainError("MISSING_ASSET", `缺少素材：${path}`);
    return b;
  }
  async put(files: Map<string, Blob>) {
    const tx = (await this.db).transaction("assets", "readwrite");
    for (const [path, blob] of files) await tx.store.put(blob, path);
    await tx.done;
  }
  async resolve(
    record: AssetRecord,
    variant: "original" | "display" | "thumbnail",
  ) {
    const file =
      record.variants.find((v) => v.kind === variant) ?? record.original;
    return this.read(file.path);
  }
  async importAtomic(
    documents: PlanetDocument[],
    u: UniverseDocument,
    files: Map<string, Blob>,
    exportId: string,
  ) {
    documents.forEach(validatePlanet);
    let validUniverse: UniverseDocument = UniverseSchema.parse(u);
    const tx = (await this.db).transaction(
      ["planets", "revisions", "assets", "universes", "imports"],
      "readwrite",
    );
    if (await tx.objectStore("imports").get(exportId)) {
      await tx.done;
      return false;
    }
    const current = await tx.objectStore("universes").get(u.universeId);
    if (current) {
      const stored = UniverseSchema.parse(current);
      const retained = validUniverse.entries.filter((e) =>
        stored.entries.some((p) => p.planetId === e.planetId),
      );
      // Imports can append copies, but cannot restore stale layouts of existing works.
      if (retained.length !== stored.entries.length) {
        tx.abort();
        await tx.done.catch(() => {});
        throw new DomainError(
          "LAYOUT_CONFLICT",
          "宇宙条目已改变，请刷新后重新导入。",
        );
      }
      const added = validUniverse.entries.filter(
        (e) =>
          !stored.entries.some((p) => p.planetId === e.planetId) &&
          documents.some((p) => p.planetId === e.planetId),
      );
      if (
        stored.schemaVersion === "1.1.0" ||
        validUniverse.schemaVersion === "1.1.0"
      ) {
        const merged = upgradeUniverse(stored);
        merged.entries.push(...added.map((e) => ({ ...e, layoutRevision: 0 })));
        validUniverse = UniverseSchema.parse(merged);
      } else
        validUniverse = UniverseSchema.parse({
          ...stored,
          entries: [...stored.entries, ...added],
        });
    }
    for (const [path, blob] of files)
      await tx.objectStore("assets").put(blob, path);
    for (const doc of documents) {
      await tx.objectStore("planets").put(doc, doc.planetId);
      await tx
        .objectStore("revisions")
        .put(doc, `${doc.planetId}:${doc.revision}`);
    }
    await tx
      .objectStore("universes")
      .put(validUniverse, validUniverse.universeId);
    await tx.objectStore("imports").put(true, exportId);
    await tx.done;
    return true;
  }
  async removeFromUniverse(id: string) {
    const db = await this.db,
      tx = db.transaction("universes", "readwrite"),
      u = (await tx.store.getAll())[0];
    u.entries = u.entries.filter((e) => e.planetId !== id);
    await tx.store.put(u, u.universeId);
    await tx.done;
  }
  async close() {
    (await this.db).close();
  }
}
