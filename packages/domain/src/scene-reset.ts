import type { PlanetDocument } from "@colorverse/contracts";
import { validatePlanet } from "./index";
export function restoreScene(
  doc: PlanetDocument,
  baseline: PlanetDocument,
  kind: "exterior" | "interior",
) {
  const next = structuredClone(doc),
    current = kind === "exterior" ? next.exterior.scene : next.interior;
  const original =
    kind === "exterior" ? baseline.exterior.scene : baseline.interior;
  const growthIds = new Set(
    next.growthEvents
      .filter((e) => e.status === "accepted")
      .flatMap((e) =>
        e.elements
          .filter((el) => el.sceneKind === kind)
          .map((el) => el.layerId),
      ),
  );
  const growthLayers = current.layers.filter((l) => growthIds.has(l.id));
  current.background = structuredClone(original.background);
  current.layers = [
    ...structuredClone(original.layers).filter(
      (l) => !growthIds.has(l.id) && !current.tombstones.includes(l.id),
    ),
    ...growthLayers,
  ];
  current.hotspots = structuredClone(original.hotspots)
    .map((h) => ({ ...h, sceneId: current.id }))
    .filter(
      (h) =>
        !h.anchorLayerId ||
        current.layers.some((l) => l.id === h.anchorLayerId),
    );
  const currentAssets = new Set(next.assetRefs.map((a) => a.assetId));
  next.assetRefs.push(
    ...baseline.assetRefs.filter((a) => !currentAssets.has(a.assetId)),
  );
  next.requiredCapabilities = [
    ...new Set([
      ...next.requiredCapabilities,
      ...baseline.requiredCapabilities,
    ]),
  ];
  if (
    ![next.exterior.scene, next.interior].some((s) =>
      s.layers.some((l) => "assetId" in l.source && l.source.crop),
    )
  )
    next.requiredCapabilities = next.requiredCapabilities.filter(
      (c) => c !== "image-crop@1",
    );
  return validatePlanet(next);
}
