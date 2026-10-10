import { NewDecorationIds } from "./decorations";
import {
  PlanetSchema,
  type PlanetDocument,
  type SceneDocument,
  type Layer,
  GrowthPresets,
  GROWTH_LIBRARY_CAPABILITY,
} from "@colorverse/contracts";
export * from "./universe";
export * from "./decorations";
export * from "./image-editing";
export * from "./scene-reset";
export * from "./course";
export * from "./showcase";
export * from "./growth-geometry";
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export const clone = <T>(value: T): T => structuredClone(value);
export function validatePlanet(input: unknown): PlanetDocument {
  const doc = PlanetSchema.parse(input);
  const supported = [
    "image-layer@1",
    "hotspots@1",
    "effects@1",
    "preset-layer@1",
    "decorations@1",
    "image-crop@1",
    "showcase@1",
    GROWTH_LIBRARY_CAPABILITY,
  ];
  if (doc.requiredCapabilities.some((c) => !supported.includes(c)))
    throw new DomainError("UNSUPPORTED_VERSION", "作品需要尚不支持的功能");
  if (
    (doc.archiveEntries.some((a) => a.sourceType === "student") ||
      doc.growthEvents.some(
        (e) => e.trigger.kind === "archive" || e.provider.kind === "rules",
      )) &&
    !doc.requiredCapabilities.includes("showcase@1")
  )
    throw new DomainError(
      "VALIDATION_FAILED",
      "展示作品必须声明 showcase@1 能力",
    );
  const ids = new Set<string>();
  const add = (id: string) => {
    if (ids.has(id))
      throw new DomainError("VALIDATION_FAILED", "作品中存在重复 ID");
    ids.add(id);
  };
  const assets = new Set(doc.assetRefs.map((a) => a.assetId));
  const archives = new Set(doc.archiveEntries.map((a) => a.id));
  const requireAsset = (id: string) => {
    if (!assets.has(id))
      throw new DomainError("MISSING_ASSET", "作品中存在未声明的素材");
  };
  doc.assetRefs.forEach((a) => add(a.assetId));
  doc.archiveEntries.forEach((a) => {
    add(a.id);
    a.imageAssetIds.forEach(requireAsset);
  });
  for (const scene of [doc.exterior.scene, doc.interior]) {
    add(scene.id);
    if (scene.background.type === "image")
      requireAsset(scene.background.assetId);
    if (
      scene.background.type === "linearGradient" &&
      scene.background.stops.some(
        (s, i, all) => i > 0 && s.offset < all[i - 1].offset,
      )
    )
      throw new DomainError("VALIDATION_FAILED", "渐变色标必须按顺序排列");
    const layerIds = new Set(scene.layers.map((l) => l.id));
    for (const l of scene.layers) {
      add(l.id);
      if (
        "presetId" in l.source &&
        l.source.presetId !== "sphere" &&
        GrowthPresets[l.source.presetId].capability ===
          GROWTH_LIBRARY_CAPABILITY &&
        !doc.requiredCapabilities.includes(GROWTH_LIBRARY_CAPABILITY)
      )
        throw new DomainError(
          "VALIDATION_FAILED",
          "新成长元素必须声明 growth-library@1 能力",
        );
      if ("effectId" in l.source && l.source.anchorLayerId) {
        const anchor = scene.layers.find(
          (a) =>
            a.id ===
            ("effectId" in l.source ? l.source.anchorLayerId : undefined),
        );
        if (!anchor || anchor.kind !== "image")
          throw new DomainError(
            "VALIDATION_FAILED",
            "装饰只能跟随同场景的图片主体",
          );
        if (!doc.requiredCapabilities.includes("decorations@1"))
          throw new DomainError(
            "VALIDATION_FAILED",
            "跟随装饰必须声明 decorations@1 能力",
          );
      }
      if (
        "effectId" in l.source &&
        NewDecorationIds.includes(l.source.effectId) &&
        !doc.requiredCapabilities.includes("decorations@1")
      )
        throw new DomainError(
          "VALIDATION_FAILED",
          "新装饰必须声明 decorations@1 能力",
        );
      const expected =
        "assetId" in l.source
          ? "image"
          : "effectId" in l.source
            ? "effect"
            : "preset";
      if (l.kind !== expected)
        throw new DomainError("VALIDATION_FAILED", "图层类型与来源不一致");
      if ("assetId" in l.source) {
        requireAsset(l.source.assetId);
        const crop = l.source.crop;
        if (
          crop &&
          (!doc.requiredCapabilities.includes("image-crop@1") ||
            crop.x + crop.width > 1 + 1e-9 ||
            crop.y + crop.height > 1 + 1e-9)
        )
          throw new DomainError(
            "VALIDATION_FAILED",
            "裁剪范围错误或缺少 image-crop@1 能力",
          );
      }
      if (
        "presetId" in l.source &&
        l.source.presetId === "sphere" &&
        l.source.params.textureAssetId
      )
        requireAsset(l.source.params.textureAssetId);
      for (const animation of l.animation)
        if (
          animation.type === "breathe" &&
          animation.minOpacity > animation.maxOpacity
        )
          throw new DomainError("VALIDATION_FAILED", "呼吸透明度范围错误");
    }
    scene.tombstones.forEach(add);
    for (const h of scene.hotspots) {
      add(h.id);
      if (
        h.sceneId !== scene.id ||
        (h.anchorLayerId && !layerIds.has(h.anchorLayerId))
      )
        throw new DomainError("VALIDATION_FAILED", "热点图层归属错误");
      if (h.action.type === "showImage") requireAsset(h.action.assetId);
      if (
        h.action.type === "openArchive" &&
        !archives.has(h.action.archiveEntryId)
      )
        throw new DomainError("VALIDATION_FAILED", "热点档案不存在");
    }
  }
  if (
    doc.exterior.mode === "artwork" &&
    !doc.exterior.scene.layers.some((l) => l.kind === "image")
  )
    throw new DomainError(
      "VALIDATION_FAILED",
      "原创星球必须保留一个主体图片图层",
    );
  const triggerKeys = new Set<string>();
  const showcaseSources = new Set<string>();
  for (const e of doc.growthEvents) {
    add(e.eventId);
    if (
      e.planetId !== doc.planetId ||
      triggerKeys.has(e.trigger.idempotencyKey)
    )
      throw new DomainError("VALIDATION_FAILED", "成长记录归属或触发键重复");
    triggerKeys.add(e.trigger.idempotencyKey);
    if (e.trigger.kind === "archive") {
      const archiveId = e.trigger.archiveEntryId;
      const source = doc.archiveEntries.find((a) => a.id === archiveId);
      if (source?.sourceType !== "student" || showcaseSources.has(source.id))
        throw new DomainError("VALIDATION_FAILED", "展示成长来源不正确或重复");
      showcaseSources.add(source.id);
    }
    if (e.provider.kind === "rules" && e.trigger.kind !== "archive")
      throw new DomainError("VALIDATION_FAILED", "规则成长需要展示作品来源");
    if (
      (e.trigger.kind === "mock" || e.trigger.kind === "archive") &&
      !archives.has(e.trigger.archiveEntryId)
    )
      throw new DomainError("VALIDATION_FAILED", "成长来源档案不存在");
    for (const el of e.elements) {
      if (
        GrowthPresets[el.presetId].capability === GROWTH_LIBRARY_CAPABILITY &&
        !doc.requiredCapabilities.includes(GROWTH_LIBRARY_CAPABILITY)
      )
        throw new DomainError(
          "VALIDATION_FAILED",
          "新成长建议必须声明 growth-library@1 能力",
        );
      const s = el.sceneKind === "interior" ? doc.interior : doc.exterior.scene;
      if (e.status === "accepted" && !s.layers.some((l) => l.id === el.layerId))
        throw new DomainError("VALIDATION_FAILED", "成长图层丢失");
      if (e.status === "reverted" && !s.tombstones.includes(el.layerId))
        throw new DomainError("VALIDATION_FAILED", "撤销成长缺少历史标记");
    }
  }
  if (doc.extensions && JSON.stringify(doc.extensions).length > 65536)
    throw new DomainError("VALIDATION_FAILED", "扩展数据过大");
  return doc;
}
export function sortedLayers(scene: SceneDocument) {
  const order = { background: 0, middle: 1, foreground: 2 };
  return [...scene.layers].sort(
    (a, b) =>
      order[a.depth] - order[b.depth] ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
}
export function layerPoint(layer: Layer, x: number, y: number) {
  const t = layer.transform,
    r = (t.rotationDeg * Math.PI) / 180,
    dx = x - t.x,
    dy = y - t.y;
  return {
    x: (dx * Math.cos(r) + dy * Math.sin(r)) / t.scaleX,
    y: (-dx * Math.sin(r) + dy * Math.cos(r)) / t.scaleY,
  };
}
export function hitTest(scene: SceneDocument, x: number, y: number) {
  return [...scene.hotspots].reverse().find((h) => {
    const l = h.anchorLayerId
      ? scene.layers.find((l) => l.id === h.anchorLayerId)
      : undefined;
    if (l && (!l.visible || l.opacity === 0)) return false;
    const p = l ? layerPoint(l, x, y) : { x, y };
    const g = h.geometry;
    return g.type === "circle"
      ? Math.hypot(p.x - g.x, p.y - g.y) <= g.radius
      : p.x >= g.x &&
          p.y >= g.y &&
          p.x <= g.x + g.width &&
          p.y <= g.y + g.height;
  });
}
export function colorFamily(hex: string) {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  if (d < 0.12) return "neutral";
  let h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h < 65 || h >= 330 ? "warm" : h < 190 ? "green" : "cool";
}
export function filterPlanets(
  planets: PlanetDocument[],
  query: string,
  family: string,
  emotion: string,
) {
  const q = query.trim().normalize("NFKC").toLocaleLowerCase();
  return planets.filter(
    (p) =>
      (!q ||
        `${p.metadata.name} ${p.metadata.authorDisplayName} ${p.metadata.theme} ${p.metadata.emotionTags.join(" ")}`
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(q)) &&
      (family === "all" ||
        colorFamily(p.metadata.palette.primary) === family) &&
      (!emotion || p.metadata.emotionTags.includes(emotion)),
  );
}
