import {
  type PlanetDocument,
  type UniverseDocument,
  type AssetRecord,
  type GrowthEvent,
  defaultTransform,
  defaultAdjustments,
  VERSION,
  GrowthSchema,
} from "@colorverse/contracts";
import { clone, validatePlanet, DomainError } from "@colorverse/domain";
export * from "./universe-layout";
export interface PlanetRepository {
  get(id: string): Promise<PlanetDocument>;
  list(): Promise<PlanetDocument[]>;
  save(doc: PlanetDocument, expectedRevision: number): Promise<PlanetDocument>;
}
export interface WorkspaceRepository extends PlanetRepository {
  getBaseline(id: string): Promise<PlanetDocument>;
  getUniverse(): Promise<UniverseDocument>;
  saveUniverse(universe: UniverseDocument): Promise<void>;
  importAtomic(
    documents: PlanetDocument[],
    universe: UniverseDocument,
    files: Map<string, Blob>,
    exportId: string,
  ): Promise<boolean>;
  removeFromUniverse(id: string): Promise<void>;
}
export interface AssetStore {
  read(path: string): Promise<Blob>;
  put(files: Map<string, Blob>): Promise<void>;
  resolve(
    record: AssetRecord,
    variant: "original" | "display" | "thumbnail",
  ): Promise<Blob>;
}
export class PlanetService {
  constructor(public repository: PlanetRepository) {}
  async save(doc: PlanetDocument, revision: number) {
    return this.repository.save(validatePlanet(doc), revision);
  }
}
export class GrowthService {
  constructor(
    private repository: PlanetRepository,
    private now = () => new Date().toISOString(),
    private uuid = () => crypto.randomUUID(),
  ) {}
  async propose(
    planetId: string,
    mockSubmissionId: string,
  ): Promise<GrowthEvent> {
    const doc = await this.repository.get(planetId),
      key = `mock:${planetId}:${mockSubmissionId}`;
    const existing = doc.growthEvents.find(
      (e) => e.trigger.idempotencyKey === key,
    );
    if (existing) return existing;
    const archive = doc.archiveEntries[0];
    if (!archive)
      throw new DomainError(
        "VALIDATION_FAILED",
        "请先添加一个作品档案作为成长来源",
      );
    const event: GrowthEvent = {
      schemaVersion: VERSION,
      eventId: this.uuid(),
      planetId,
      trigger: {
        kind: "mock",
        mockSubmissionId,
        archiveEntryId: archive.id,
        idempotencyKey: key,
      },
      baseRevision: doc.revision,
      status: "proposed",
      summary:
        "从作品的主题色中，长出一朵微光花。你可以先调整颜色和位置，再决定是否接受。",
      elements: [
        {
          layerId: this.uuid(),
          sceneKind: "interior",
          presetId: "glow-flower",
          presetVersion: VERSION,
          params: {
            x: 0.64,
            y: 0.72,
            scale: 1,
            rotationDeg: 0,
            color: doc.metadata.palette.primary,
            opacity: 0.95,
            glowIntensity: 0.6,
            motionSpeed: 0.35,
            seed: 42,
          },
        },
      ],
      createdAt: this.now(),
      acceptedAt: null,
      appliedRevision: null,
      revertedAt: null,
      revertedRevision: null,
      provider: {
        kind: "mock",
        adapter: "deterministic-mock-v1",
        model: "none",
        promptVersion: "mock-v1",
      },
      policyVersion: "growth-policy-v1",
    };
    doc.growthEvents.push(event);
    const saved = await this.repository.save(doc, doc.revision);
    return saved.growthEvents.find((e) => e.eventId === event.eventId)!;
  }
  async accept(event: GrowthEvent, revision: number) {
    const proposed = GrowthSchema.parse(event),
      doc = await this.repository.get(event.planetId),
      stored = doc.growthEvents.find((e) => e.eventId === event.eventId);
    if (stored?.status === "accepted") return doc;
    if (!stored || stored.status !== "proposed")
      throw new DomainError("VALIDATION_FAILED", "此建议已处理，不能再次接受");
    if (doc.revision !== revision)
      throw new DomainError(
        "REVISION_CONFLICT",
        "星球已变化，请刷新建议后再确认",
      );
    if (
      proposed.elements.some(
        (el, i) => el.layerId !== stored.elements[i]?.layerId,
      ) ||
      proposed.elements.length !== stored.elements.length
    )
      throw new DomainError("VALIDATION_FAILED", "不能改变建议的图层身份");
    if (
      doc.growthEvents.filter(
        (e) => e.status === "accepted" || e.status === "reverted",
      ).length >= 24
    )
      throw new DomainError(
        "BUDGET_EXCEEDED",
        "本星球已达到本阶段的成长次数上限",
      );
    for (const el of proposed.elements) {
      const scene =
        el.sceneKind === "interior" ? doc.interior : doc.exterior.scene;
      scene.layers.push({
        id: el.layerId,
        kind: "preset",
        depth: "foreground",
        order: scene.layers.length,
        transform: {
          ...defaultTransform(
            el.params.x * scene.width,
            el.params.y * scene.height,
          ),
          scaleX: el.params.scale,
          scaleY: el.params.scale,
          rotationDeg: el.params.rotationDeg,
        },
        opacity: el.params.opacity,
        visible: true,
        adjustments: defaultAdjustments(),
        animation: [
          { type: "breathe", minOpacity: 0.75, maxOpacity: 1, periodSec: 4 },
        ],
        parallaxFactor: 0,
        source: {
          presetId: el.presetId,
          presetVersion: VERSION,
          params: el.params,
        },
      });
    }
    Object.assign(stored, {
      elements: clone(proposed.elements),
      baseRevision: doc.revision,
      status: "accepted",
      acceptedAt: this.now(),
      appliedRevision: doc.revision + 1,
    });
    return this.repository.save(doc, revision);
  }
  async reject(planetId: string, eventId: string) {
    const doc = await this.repository.get(planetId),
      e = doc.growthEvents.find((e) => e.eventId === eventId);
    if (!e) throw new DomainError("NOT_FOUND", "建议不存在");
    if (e.status === "rejected") return doc;
    if (e.status !== "proposed")
      throw new DomainError("VALIDATION_FAILED", "建议已处理");
    e.status = "rejected";
    return this.repository.save(doc, doc.revision);
  }
  async revert(planetId: string, eventId: string, revision: number) {
    const doc = await this.repository.get(planetId),
      event = doc.growthEvents.find((e) => e.eventId === eventId);
    if (!event) throw new DomainError("NOT_FOUND", "成长不存在");
    if (event.status === "reverted") return doc;
    if (event.status !== "accepted")
      throw new DomainError("VALIDATION_FAILED", "只能撤销已接受的成长");
    for (const el of event.elements) {
      const scene =
        el.sceneKind === "interior" ? doc.interior : doc.exterior.scene;
      if (scene.hotspots.some((h) => h.anchorLayerId === el.layerId))
        throw new DomainError(
          "VALIDATION_FAILED",
          "请先解除成长图层上的热点绑定",
        );
      scene.layers = scene.layers.filter((l) => l.id !== el.layerId);
      scene.tombstones.push(el.layerId);
    }
    event.status = "reverted";
    event.revertedAt = this.now();
    event.revertedRevision = doc.revision + 1;
    return this.repository.save(doc, revision);
  }
}
export function growthOverlay(
  doc: PlanetDocument,
  event: GrowthEvent,
): PlanetDocument {
  const preview = clone(doc);
  for (const el of event.elements) {
    const scene =
      el.sceneKind === "interior" ? preview.interior : preview.exterior.scene;
    scene.layers.push({
      id: el.layerId,
      kind: "preset",
      depth: "foreground",
      order: 999,
      transform: {
        ...defaultTransform(
          el.params.x * scene.width,
          el.params.y * scene.height,
        ),
        scaleX: el.params.scale,
        scaleY: el.params.scale,
        rotationDeg: el.params.rotationDeg,
      },
      opacity: el.params.opacity,
      visible: true,
      adjustments: defaultAdjustments(),
      animation: [],
      parallaxFactor: 0,
      source: {
        presetId: el.presetId,
        presetVersion: VERSION,
        params: el.params,
      },
    });
  }
  return preview;
}
