import { openDB, type DBSchema } from "idb";
import { z } from "zod";
import {
  ExperiencePlanet,
  type ExperiencePlanetData,
} from "./competition-model";
export const OFFLINE_DB_NAME = "colorverse-judges-offline-v1";
export type ExperienceRole = "student" | "teacher" | "guest";
const Interaction = z.object({
  id: z.string(),
  planetId: z.string(),
  workId: z.string().nullable(),
  kind: z.enum(["like", "emoji", "comment"]),
  content: z.string().max(500),
  author: z.string(),
  createdAt: z.string(),
});
export const ExperienceState = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  ownPlanet: ExperiencePlanet.nullable(),
  overrides: z.record(z.string(), ExperiencePlanet),
  interactions: z.array(Interaction).max(3000),
  assignments: z
    .array(
      z.object({
        id: z.uuid(),
        taskId: z.enum(["T01", "T02", "T03"]),
        publishedAt: z.string(),
      }),
    )
    .max(100)
    .default([]),
  readNotifications: z.array(z.string()).max(500).default([]),
});
export type OfflineState = z.infer<typeof ExperienceState>;
export const blankExperience = (revision = 0): OfflineState => ({
  version: 1,
  revision,
  ownPlanet: null,
  overrides: {},
  interactions: [],
  assignments: [],
  readNotifications: [],
});
interface OfflineDB extends DBSchema {
  state: { key: string; value: OfflineState };
  media: { key: string; value: Blob };
}
export class OfflineExperienceStore {
  private db = openDB<OfflineDB>(OFFLINE_DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("state");
      db.createObjectStore("media");
    },
  });
  async load() {
    return ExperienceState.parse(
      (await (await this.db).get("state", "current")) ?? blankExperience(),
    );
  }
  async media(key: string) {
    return (await this.db).get("media", key);
  }
  async commit(
    expected: number,
    role: ExperienceRole,
    update: (s: OfflineState) => OfflineState,
    media = new Map<string, Blob>(),
  ) {
    if (role === "guest") throw Error("游客只可浏览，请切换到学生或教师体验。");
    const tx = (await this.db).transaction(["state", "media"], "readwrite");
    try {
      const state = ExperienceState.parse(
        (await tx.objectStore("state").get("current")) ?? blankExperience(),
      );
      if (state.revision !== expected)
        throw Error("另一个窗口已修改体验，请刷新后重试。");
      const next = ExperienceState.parse({
        ...update(structuredClone(state)),
        revision: expected + 1,
      });
      if (
        role === "student" &&
        JSON.stringify(next.overrides) !== JSON.stringify(state.overrides)
      )
        throw Error("学生只能编辑自己的星球。");
      for (const [key, blob] of media)
        await tx.objectStore("media").put(blob, key);
      await tx.objectStore("state").put(next, "current");
      await tx.done;
      return next;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw e;
    }
  }
  async savePlanet(
    expected: number,
    role: ExperienceRole,
    planet: ExperiencePlanetData,
    media = new Map<string, Blob>(),
  ) {
    if (role === "student" && planet.id !== "my-offline-planet")
      throw Error("学生只能编辑自己的星球。");
    if (
      role === "teacher" &&
      !/^demo-[1-5]$/.test(planet.id) &&
      planet.id !== "my-offline-planet"
    )
      throw Error("请选择本次体验中的示例星球。");
    return this.commit(
      expected,
      role,
      (s) => {
        const previous =
          planet.id === "my-offline-planet"
            ? s.ownPlanet
            : s.overrides[planet.id];
        const next = {
          ...planet,
          document: {
            ...planet.document,
            revision:
              (previous?.document.revision ?? planet.document.revision) + 1,
          },
        };
        if (planet.id === "my-offline-planet") s.ownPlanet = next;
        else s.overrides[planet.id] = next;
        return s;
      },
      media,
    );
  }
  async interact(
    expected: number,
    role: ExperienceRole,
    value: Omit<z.infer<typeof Interaction>, "id" | "createdAt" | "author">,
  ) {
    return this.commit(expected, role, (s) => {
      if (value.kind !== "comment") {
        const old = s.interactions.findIndex(
          (i) =>
            i.planetId === value.planetId &&
            i.workId === value.workId &&
            i.kind === value.kind,
        );
        if (old >= 0) {
          s.interactions.splice(old, 1);
          return s;
        }
      }
      s.interactions.push({
        ...value,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        author: role === "teacher" ? "体验教师" : "体验同学",
      });
      return s;
    });
  }
  async reset(expected: number, role: ExperienceRole | null) {
    if (role === "guest") throw Error("游客只能浏览，不能重置创作。");
    const tx = (await this.db).transaction(["state", "media"], "readwrite");
    try {
      const old =
        (await tx.objectStore("state").get("current")) ?? blankExperience();
      if (old.revision !== expected)
        throw Error("体验已在另一个窗口更新，请刷新后重试。");
      const next = blankExperience(expected + 1);
      await tx.objectStore("media").clear();
      await tx.objectStore("state").put(next, "current");
      await tx.done;
      return next;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw e;
    }
  }
  async publishAssignment(
    expected: number,
    role: ExperienceRole,
    taskId: string,
  ) {
    if (role !== "teacher") throw Error("只有教师可以发布作业。");
    const id = z.enum(["T01", "T02", "T03"]).parse(taskId);
    return this.commit(expected, role, (s) => ({
      ...s,
      assignments: [
        ...s.assignments,
        {
          id: crypto.randomUUID(),
          taskId: id,
          publishedAt: new Date().toISOString(),
        },
      ].slice(-100),
    }));
  }
  async readNotification(expected: number, role: ExperienceRole, id: string) {
    return this.commit(expected, role, (s) => ({
      ...s,
      readNotifications: [...new Set([...s.readNotifications, `${role}:${id}`])].slice(-500),
    }));
  }
  async close() {
    (await this.db).close();
  }
}
