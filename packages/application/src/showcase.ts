import {
  ArchiveSchema,
  AssetSchema,
  VERSION,
  color,
  type ArchiveEntry,
  type AssetRecord,
  type PlanetDocument,
  type GrowthEvent,
  GrowthPresets,
} from "@colorverse/contracts";
import { DomainError, validatePlanet } from "@colorverse/domain";
import { showcaseChoice } from "@colorverse/domain";
import type { PlanetRepository } from "./index";

export interface ShowcaseRepository extends PlanetRepository {
  saveWithAssets(
    doc: PlanetDocument,
    expectedRevision: number,
    files: Map<string, Blob>,
  ): Promise<PlanetDocument>;
}
export class ShowcaseService {
  constructor(
    private repository: ShowcaseRepository,
    private hash: (bytes: Uint8Array) => Promise<string>,
    private now = () => new Date().toISOString(),
    private uuid = () => crypto.randomUUID(),
  ) {}

  async save(
    planetId: string,
    revision: number,
    input: ArchiveEntry,
    asset: AssetRecord,
    files: Map<string, Blob>,
  ) {
    const archive = ArchiveSchema.parse(input),
      record = AssetSchema.parse(asset);
    if (
      archive.sourceType !== "student" ||
      archive.imageAssetIds.length !== 1 ||
      archive.imageAssetIds[0] !== record.assetId ||
      !record.original.mimeType.startsWith("image/")
    )
      throw new DomainError("VALIDATION_FAILED", "请为展示作品上传一张图片");
    const entries = [record.original, ...record.variants];
    if (
      entries.length !== files.size ||
      new Set(entries.map((f) => f.path)).size !== entries.length ||
      record.original.byteSize > 20 * 1024 * 1024
    )
      throw new DomainError("VALIDATION_FAILED", "展示素材清单或大小不正确");
    for (const entry of entries) {
      const blob = files.get(entry.path);
      if (
        !entry.path.startsWith(`assets/${record.assetId}/`) ||
        /\.\.|\\/.test(entry.path) ||
        !blob ||
        blob.size !== entry.byteSize ||
        (await this.hash(new Uint8Array(await blob.arrayBuffer()))) !==
          entry.sha256
      )
        throw new DomainError("VALIDATION_FAILED", "展示素材校验失败");
    }
    const doc = await this.repository.get(planetId);
    if (doc.revision !== revision)
      throw new DomainError("REVISION_CONFLICT", "星球已变化，请重新保存作品");
    doc.archiveEntries.push(archive);
    doc.assetRefs.push(record);
    if (!doc.requiredCapabilities.includes("showcase@1"))
      doc.requiredCapabilities.push("showcase@1");
    return this.repository.saveWithAssets(validatePlanet(doc), revision, files);
  }

  async propose(planetId: string, archiveId: string): Promise<GrowthEvent> {
    const doc = await this.repository.get(planetId);
    // Compare the source ID as well as the key: ZIP imports remap keys and IDs.
    const existing = doc.growthEvents.find(
      (e) =>
        e.trigger.kind === "archive" && e.trigger.archiveEntryId === archiveId,
    );
    if (existing) return existing;
    const archive = doc.archiveEntries.find(
      (a) => a.id === archiveId && a.sourceType === "student",
    );
    if (!archive) throw new DomainError("NOT_FOUND", "展示作品不存在");
    const choice = showcaseChoice(archive, doc.growthEvents);
    const capability = GrowthPresets[choice.presetId].capability;
    if (!doc.requiredCapabilities.includes(capability))
      doc.requiredCapabilities.push(capability);
    const extractedColor =
      archive.colorTags.find((tag) => color.safeParse(tag).success) ??
      doc.metadata.palette.primary;
    const event: GrowthEvent = {
      schemaVersion: VERSION,
      eventId: this.uuid(),
      planetId,
      trigger: {
        kind: "archive",
        archiveEntryId: archiveId,
        idempotencyKey: `archive:${planetId}:${archiveId}`,
      },
      baseRevision: doc.revision,
      status: "proposed",
      summary: `根据《${archive.title}》的配色与关键词，推荐「${GrowthPresets[choice.presetId].name}」。你也可以选择其他造型；保存预览或接受成长都不会改变原图。`,
      elements: [
        {
          layerId: this.uuid(),
          sceneKind: "interior",
          presetId: choice.presetId,
          presetVersion: VERSION,
          params: {
            x: 0.25 + (choice.seed % 50) / 100,
            y: 0.4 + ((choice.seed >>> 8) % 40) / 100,
            scale: 1,
            rotationDeg: 0,
            color: extractedColor,
            opacity: 0.95,
            glowIntensity: 0.6,
            motionSpeed: 0.35,
            seed: choice.seed,
          },
        },
      ],
      createdAt: this.now(),
      acceptedAt: null,
      appliedRevision: null,
      revertedAt: null,
      revertedRevision: null,
      provider: {
        kind: "rules",
        adapter: "showcase-rules-v2",
        model: "none",
        promptVersion: "rules-v2",
      },
      policyVersion: "growth-policy-v1",
    };
    doc.growthEvents.push(event);
    try {
      const saved = await this.repository.save(doc, doc.revision);
      return saved.growthEvents.find((e) => e.eventId === event.eventId)!;
    } catch (error) {
      if (error instanceof DomainError && error.code === "REVISION_CONFLICT") {
        const winner = (await this.repository.get(planetId)).growthEvents.find(
          (e) =>
            e.trigger.kind === "archive" &&
            e.trigger.archiveEntryId === archiveId,
        );
        if (winner) return winner;
      }
      throw error;
    }
  }
}
