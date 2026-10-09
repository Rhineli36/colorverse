import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  PlanetDocument,
  UniverseDocument,
  AssetRecord,
} from "@colorverse/contracts";
import type { WorkspaceRepository, AssetStore } from "@colorverse/application";
import {
  validatePlanet,
  DomainError,
  assertPlanetMove,
  type LayoutActor,
} from "@colorverse/domain";
import { UniverseSchema } from "@colorverse/contracts";
import type { PlanetMove } from "@colorverse/application";
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
    return u;
  }
  async saveUniverse(u: UniverseDocument) {
    await (
      await this.db
    ).put("universes", UniverseSchema.parse(u), u.universeId);
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
    const tx = (await this.db).transaction(
      ["ownership", "universes"],
      "readwrite",
    );
    try {
      assertPlanetMove(
        actor,
        (await tx.objectStore("ownership").get(move.planetId)) ?? null,
      );
      const universe = await tx.objectStore("universes").get(move.universeId);
      const entry = universe?.entries.find((e) => e.planetId === move.planetId);
      if (!universe || !entry || !entry.visible)
        throw new DomainError("NOT_FOUND", "星球已隐藏或离开当前宇宙。");
      if (
        entry.position.x !== move.expectedPosition.x ||
        entry.position.y !== move.expectedPosition.y
      )
        throw new DomainError(
          "LAYOUT_CONFLICT",
          "另一个窗口已移动这颗星球，请刷新宇宙后再移动。",
        );
      entry.position = { ...move.position };
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
    const tx = (await this.db).transaction(
      ["planets", "revisions", "assets", "universes", "imports"],
      "readwrite",
    );
    if (await tx.objectStore("imports").get(exportId)) {
      await tx.done;
      return false;
    }
    for (const [path, blob] of files)
      await tx.objectStore("assets").put(blob, path);
    for (const doc of documents) {
      await tx.objectStore("planets").put(doc, doc.planetId);
      await tx
        .objectStore("revisions")
        .put(doc, `${doc.planetId}:${doc.revision}`);
    }
    await tx.objectStore("universes").put(u, u.universeId);
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
