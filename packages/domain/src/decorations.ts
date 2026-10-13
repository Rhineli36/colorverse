import {
  defaultAdjustments,
  defaultTransform,
  VERSION,
  type EffectParams,
  type EffectIds,
  type Layer,
  type SceneDocument,
} from "@colorverse/contracts";
export type EffectId = (typeof EffectIds)[number];
export const DecorationGroups: { name: string; ids: EffectId[] }[] = [
  {
    name: "粒子与气氛",
    ids: ["stardust", "fireflies", "floating-lights", "rain", "snow", "fog"],
  },
  {
    name: "光影",
    ids: ["outer-glow", "soft-glow", "rim-light", "light-beam", "breathe"],
  },
  { name: "光环与卫星", ids: ["ring", "halo", "satellite"] },
];
export const NewDecorationIds: EffectId[] = ["halo", "rim-light", "satellite"];
export const isParticle = (id: string) =>
  ["stardust", "fireflies", "floating-lights", "rain", "snow"].includes(id);
export function createDecoration(
  id: EffectId,
  scene: SceneDocument,
  color: string,
  layerId: string,
  seed: number,
): Layer {
  const body = scene.layers.find((l) => l.kind === "image");
  const transform = body
    ? defaultTransform(0, 0)
    : defaultTransform(scene.width / 2, scene.height / 2);
  return {
    id: layerId,
    kind: "effect",
    depth: ["outer-glow", "halo"].includes(id) ? "background" : "foreground",
    order: Math.min(
      10000,
      Math.max(-1, ...scene.layers.map((l) => l.order)) + 1,
    ),
    transform,
    opacity: 1,
    visible: true,
    adjustments: defaultAdjustments(),
    animation: [],
    parallaxFactor: 0,
    source: {
      effectId: id,
      effectVersion: VERSION,
      ...(body ? { anchorLayerId: body.id } : {}),
      params: {
        color,
        intensity: 0.65,
        density: 0.3,
        opacity: 0.75,
        speed: 0.4,
        seed,
        ...(id === "satellite"
          ? {
              orbitRadiusPx: 340,
              satelliteRadiusPx: 24,
              satelliteCount: 1,
              orbitTilt: 0.5,
            }
          : {}),
      },
    },
  };
}
/** Attached effect transforms are local to a same-scene image layer. */
export function composeDecorationTransform(
  local: Layer["transform"],
  parent: Layer["transform"],
) {
  const angle = (parent.rotationDeg * Math.PI) / 180;
  const x = local.x * parent.scaleX,
    y = local.y * parent.scaleY;
  return {
    ...local,
    x: parent.x + x * Math.cos(angle) - y * Math.sin(angle),
    y: parent.y + x * Math.sin(angle) + y * Math.cos(angle),
    scaleX: parent.scaleX * local.scaleX,
    scaleY: parent.scaleY * local.scaleY,
    rotationDeg: parent.rotationDeg + local.rotationDeg,
  };
}
/** Budget is shared across all visible particle layers; floor keeps the cap exact. */
export function particleCounts(
  layers: Layer[],
  budget: number,
  perLayer = 180,
): Map<string, number> {
  const visible = layers.filter(
    (l) => l.visible && "effectId" in l.source && isParticle(l.source.effectId),
  );
  const total = visible.reduce(
    (sum, l) =>
      sum + ("effectId" in l.source ? l.source.params.density * perLayer : 0),
    0,
  );
  const factor = Math.min(1, budget / Math.max(1, total));
  return new Map(
    visible.map((l) => [
      l.id,
      Math.floor(
        ("effectId" in l.source ? l.source.params.density : 0) *
          perLayer *
          factor,
      ),
    ]),
  );
}
export function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export interface Particle {
  x: number;
  y: number;
  radius: number;
  phase: number;
  drift: number;
}
export function particlePlan(
  seed: number,
  count: number,
  width: number,
  height: number,
): Particle[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    x: (random() - 0.5) * width,
    y: (random() - 0.5) * height,
    radius: 0.8 + random() * 1.8,
    phase: random() * Math.PI * 2,
    drift: 0.5 + random(),
  }));
}
export function particlePosition(
  p: Particle,
  id: string,
  seconds: number,
  speed: number,
  height: number,
) {
  const t = seconds * speed;
  if (id === "rain" || id === "snow") {
    const travel = t * (id === "rain" ? 100 : 25) * p.drift;
    return {
      x: p.x + (id === "snow" ? Math.sin(t * 0.25 + p.phase) * 12 : 0),
      y:
        ((((p.y + height / 2 + travel) % height) + height) % height) -
        height / 2,
    };
  }
  return {
    x: p.x + (Math.cos(t * 0.7 + p.phase) - Math.cos(p.phase)) * 45 * p.drift,
    y: p.y + (Math.sin(t * 0.85 + p.phase) - Math.sin(p.phase)) * 36 * p.drift,
  };
}
export function satellitePosition(
  params: EffectParams,
  index: number,
  seconds: number,
) {
  const count = params.satelliteCount ?? 1;
  const phase =
    (params.seed / 4294967296) * Math.PI * 2 +
    (index * Math.PI * 2) / count +
    seconds * params.speed * 0.5;
  const radius = params.orbitRadiusPx ?? 340;
  return {
    x: Math.cos(phase) * radius,
    y: Math.sin(phase) * radius * (params.orbitTilt ?? 0.5),
  };
}
