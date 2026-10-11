import {
  LayerSchema,
  GrowthPresets,
  type Layer,
  type PlanetDocument,
} from "@colorverse/contracts";
import { clone, DomainError, validatePlanet } from "./index";

/** Edit a single accepted element, retaining its immutable birth/source history. */
export function updateGrowthElement(input: PlanetDocument, candidate: Layer) {
  const doc = clone(input),
    draft = LayerSchema.parse(candidate);
  const event = doc.growthEvents.find(
    (e) =>
      e.status === "accepted" &&
      e.elements.some((el) => el.layerId === draft.id),
  );
  const element = event?.elements.find((el) => el.layerId === draft.id);
  if (!element)
    throw new DomainError(
      "NOT_FOUND",
      "元素已移除或成长已撤销，请重新打开星球",
    );
  const scene =
    element.sceneKind === "interior" ? doc.interior : doc.exterior.scene;
  const index = scene.layers.findIndex((l) => l.id === draft.id),
    before = scene.layers[index];
  if (
    !before ||
    !("presetId" in draft.source) ||
    draft.source.presetId === "sphere" ||
    !("presetId" in before.source) ||
    before.source.presetId === "sphere"
  )
    throw new DomainError("VALIDATION_FAILED", "只能修改当前生长元素");
  if (
    draft.kind !== before.kind ||
    draft.depth !== before.depth ||
    draft.order !== before.order ||
    draft.visible !== before.visible ||
    draft.parallaxFactor !== before.parallaxFactor ||
    draft.source.params.seed !== before.source.params.seed ||
    draft.transform.anchorX !== before.transform.anchorX ||
    draft.transform.anchorY !== before.transform.anchorY
  )
    throw new DomainError(
      "VALIDATION_FAILED",
      "不能改变元素身份、层级或生成种子",
    );
  const t = draft.transform;
  if (
    t.x < 0 ||
    t.x > scene.width ||
    t.y < 0 ||
    t.y > scene.height ||
    t.scaleX !== t.scaleY ||
    t.scaleX < 0.1 ||
    t.scaleX > 2
  )
    throw new DomainError("VALIDATION_FAILED", "元素位置或大小超出编辑范围");
  draft.source.params = {
    ...draft.source.params,
    x: t.x / scene.width,
    y: t.y / scene.height,
    scale: t.scaleX,
    rotationDeg: t.rotationDeg,
    opacity: draft.opacity,
  };
  const capability = GrowthPresets[draft.source.presetId].capability;
  if (!doc.requiredCapabilities.includes(capability))
    doc.requiredCapabilities.push(capability);
  if (
    draft.source.params.particleStyle &&
    !doc.requiredCapabilities.includes("growth-particles@1")
  )
    doc.requiredCapabilities.push("growth-particles@1");
  scene.layers[index] = draft;
  return validatePlanet(doc);
}
