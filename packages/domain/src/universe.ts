import {
  UniverseSchema,
  MOTION_CAPABILITY,
  type UniverseDocument,
  type MotionUniverseDocument,
  type PlanetMotion,
} from "@colorverse/contracts";

export const DEFAULT_PLANET_MOTION: PlanetMotion = {
  version: "1.0.0",
  mode: "slow",
  trajectory: "ellipse",
  range: "regular",
  direction: "forward",
};
// Explicit migration: preserve every old anchor and legacy path until configured.
export function upgradeUniverse(
  input: UniverseDocument,
): MotionUniverseDocument {
  const u = UniverseSchema.parse(input);
  if (u.schemaVersion === "1.1.0") return structuredClone(u);
  return {
    ...u,
    schemaVersion: "1.1.0",
    layout: { ...u.layout, version: "1.1.0" },
    requiredCapabilities: [MOTION_CAPABILITY],
    entries: u.entries.map((e) => ({ ...e, layoutRevision: 0 })),
  };
}

export type UniverseEntry = UniverseDocument["entries"][number];
type PlanetGeometry = Pick<UniverseEntry, "planetId" | "position" | "scale"> &
  Partial<Pick<UniverseEntry, "layoutRevision" | "visible" | "order">> & {
    motion?: PlanetMotion;
  };
export interface UniverseCamera {
  x: number;
  y: number;
  zoom: number;
}
export interface Orbit {
  center: { x: number; y: number };
  radiusX: number;
  radiusY: number;
  rotation: number;
  phase: number;
  periodSec: number;
  direction: number;
  trajectory?: PlanetMotion["trajectory"];
  stationary?: boolean;
}
export const MIN_UNIVERSE_ZOOM = 0.04;
export const MAX_UNIVERSE_ZOOM = 2.5;
export const PLANET_FOCUS_ZOOM = 0.38;
// The classroom is a bounded deployment area inside the larger visual universe.
// World units; changing this policy never rescales or rearranges saved works.
export const CLASSROOM_SPACE = {
  width: 40000,
  height: 22500,
  centerX: 800,
  centerY: 450,
} as const;
export const CLASSROOM_BOUNDS = {
  left: CLASSROOM_SPACE.centerX - CLASSROOM_SPACE.width / 2,
  right: CLASSROOM_SPACE.centerX + CLASSROOM_SPACE.width / 2,
  top: CLASSROOM_SPACE.centerY - CLASSROOM_SPACE.height / 2,
  bottom: CLASSROOM_SPACE.centerY + CLASSROOM_SPACE.height / 2,
} as const;
// Frame-rate independent easing: reach about 95% of a focus move in 1.25s.
export function cameraTransitionAmount(
  seconds: number,
  focus: boolean,
  reducedMotion = false,
) {
  return reducedMotion
    ? 1
    : 1 - Math.exp(-Math.max(0, seconds) * (focus ? 2.4 : 6));
}
export const MIN_PLANET_DISPLAY_SCALE = 0.8;
export const MAX_PLANET_DISPLAY_SCALE = 1.2;
// Bound presentation sizes without rewriting legacy layout or image transforms.
export function planetDisplayScale(scale: number) {
  return Math.max(
    MIN_PLANET_DISPLAY_SCALE,
    Math.min(MAX_PLANET_DISPLAY_SCALE, Number.isFinite(scale) ? scale : 1),
  );
}

// Layout positions remain the persisted anchors. Motion is a deterministic view projection.
export function planetOrbit(entry: PlanetGeometry, seed: number): Orbit {
  let hash = seed >>> 0;
  for (const c of entry.planetId)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    return hash / 4294967296;
  };
  const orbit: Orbit = {
    center: { ...entry.position },
    radiusX: 75 + random() * 80,
    radiusY: 35 + random() * 45,
    rotation: random() * Math.PI,
    phase: random() * Math.PI * 2,
    periodSec: 90 + random() * 100,
    direction: random() > 0.5 ? 1 : -1,
  };
  if (entry.motion) {
    const m = entry.motion,
      radius = { compact: 60, regular: 110, wide: 165 }[m.range];
    orbit.trajectory = m.trajectory;
    orbit.stationary = m.mode === "stationary";
    orbit.radiusX = orbit.stationary ? 0 : radius;
    orbit.radiusY =
      orbit.stationary || m.trajectory === "drift"
        ? 0
        : radius * (m.trajectory === "circle" ? 1 : 0.55);
    orbit.phase = 0;
    orbit.periodSec =
      m.mode === "fast"
        ? 12 + (orbit.periodSec - 90) * 0.08
        : 45 + (orbit.periodSec - 90) * 0.3;
    orbit.direction = m.direction === "forward" ? 1 : -1;
  }
  const initial = orbitPosition(orbit, 0);
  orbit.center.x += entry.position.x - initial.x;
  orbit.center.y += entry.position.y - initial.y;
  return orbit;
}
export function orbitPosition(orbit: Orbit, seconds: number) {
  if (orbit.stationary) return { ...orbit.center };
  const angle =
    orbit.phase + (orbit.direction * seconds * Math.PI * 2) / orbit.periodSec;
  const x =
      (orbit.trajectory === "figure-eight" || orbit.trajectory === "drift"
        ? Math.sin(angle)
        : Math.cos(angle)) * orbit.radiusX,
    y =
      Math.sin(angle * (orbit.trajectory === "figure-eight" ? 2 : 1)) *
      orbit.radiusY;
  return {
    x:
      orbit.center.x +
      x * Math.cos(orbit.rotation) -
      y * Math.sin(orbit.rotation),
    y:
      orbit.center.y +
      x * Math.sin(orbit.rotation) +
      y * Math.cos(orbit.rotation),
  };
}
export function orbitBounds(entry: PlanetGeometry, seed: number) {
  const o = planetOrbit(entry, seed),
    radius = 256 * planetDisplayScale(entry.scale) * 0.9;
  const rx =
    (o.trajectory === "figure-eight"
      ? Math.abs(o.radiusX * Math.cos(o.rotation)) +
        Math.abs(o.radiusY * Math.sin(o.rotation))
      : Math.hypot(
          o.radiusX * Math.cos(o.rotation),
          o.radiusY * Math.sin(o.rotation),
        )) + radius;
  const ry =
    (o.trajectory === "figure-eight"
      ? Math.abs(o.radiusX * Math.sin(o.rotation)) +
        Math.abs(o.radiusY * Math.cos(o.rotation))
      : Math.hypot(
          o.radiusX * Math.sin(o.rotation),
          o.radiusY * Math.cos(o.rotation),
        )) + radius;
  return {
    left: o.center.x - rx,
    right: o.center.x + rx,
    top: o.center.y - ry,
    bottom: o.center.y + ry,
  };
}
export function orbitPath(orbit: Orbit) {
  return Array.from({ length: 65 }, (_, i) =>
    orbitPosition(orbit, (orbit.periodSec * i) / 64),
  );
}
/** Reserve the complete orbit and body, including asymmetric anchor offsets. */
export function clampPlanetPosition(
  entry: PlanetGeometry,
  seed: number,
  position: { x: number; y: number },
) {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
    throw new Error("星球位置必须是有限坐标。");
  const offsets = orbitBounds({ ...entry, position: { x: 0, y: 0 } }, seed);
  return {
    x: Math.max(
      CLASSROOM_BOUNDS.left - offsets.left,
      Math.min(CLASSROOM_BOUNDS.right - offsets.right, position.x),
    ),
    y: Math.max(
      CLASSROOM_BOUNDS.top - offsets.top,
      Math.min(CLASSROOM_BOUNDS.bottom - offsets.bottom, position.y),
    ),
  };
}
export function isPlanetInsideClassroom(entry: PlanetGeometry, seed: number) {
  const b = orbitBounds(entry, seed),
    area = CLASSROOM_BOUNDS,
    epsilon = 1e-7;
  return (
    b.left >= area.left - epsilon &&
    b.right <= area.right + epsilon &&
    b.top >= area.top - epsilon &&
    b.bottom <= area.bottom + epsilon
  );
}
export function cameraAt(
  point: { x: number; y: number },
  zoom: number,
): UniverseCamera {
  return { x: (800 - point.x) * zoom, y: (450 - point.y) * zoom, zoom };
}
export function overviewCamera(
  entries: UniverseEntry[],
  seed: number,
  viewport: { width: number; height: number },
): UniverseCamera {
  const bounds = entries
    .filter((e) => e.visible)
    .map((e) => orbitBounds(e, seed));
  const left = Math.min(-1800, ...bounds.map((b) => b.left)),
    right = Math.max(3400, ...bounds.map((b) => b.right));
  const top = Math.min(-1050, ...bounds.map((b) => b.top)),
    bottom = Math.max(1950, ...bounds.map((b) => b.bottom));
  const base = Math.min(viewport.width / 1600, viewport.height / 900);
  const upper = viewport.width < 650 ? 160 : 120,
    lower = viewport.width < 650 ? 180 : 135;
  const height = Math.max(100, viewport.height - upper - lower);
  const zoom = Math.max(
    MIN_UNIVERSE_ZOOM,
    Math.min(
      0.32,
      (viewport.width * 0.88) / base / Math.max(1, right - left),
      height / base / Math.max(1, bottom - top),
    ),
  );
  const camera = cameraAt(
    { x: (left + right) / 2, y: (top + bottom) / 2 },
    zoom,
  );
  camera.y += (upper - lower) / 2 / base;
  return camera;
}
export interface LayoutActor {
  userId: string;
  role: "student" | "teacher";
}
export function canMovePlanet(actor: LayoutActor, ownerUserId: string | null) {
  return (
    Boolean(actor.userId) &&
    (actor.role === "teacher" ||
      (actor.role === "student" && ownerUserId === actor.userId))
  );
}
export function assertPlanetMove(
  actor: LayoutActor,
  ownerUserId: string | null,
) {
  if (!canMovePlanet(actor, ownerUserId))
    throw new Error("学生只能移动自己的星球；教师可以移动全部星球。");
}
export function zoomAt(
  camera: UniverseCamera,
  point: { x: number; y: number },
  zoom: number,
) {
  const next = Math.max(MIN_UNIVERSE_ZOOM, Math.min(MAX_UNIVERSE_ZOOM, zoom));
  return {
    x: camera.x + (point.x - 800) * (camera.zoom - next),
    y: camera.y + (point.y - 450) * (camera.zoom - next),
    zoom: next,
  };
}
export function regionCamera(
  bounds: { left: number; right: number; top: number; bottom: number },
  viewport: { width: number; height: number },
) {
  const base = Math.min(viewport.width / 1600, viewport.height / 900);
  const zoom = Math.max(
    MIN_UNIVERSE_ZOOM,
    Math.min(
      MAX_UNIVERSE_ZOOM,
      (viewport.width * 0.8) / base / Math.max(1, bounds.right - bounds.left),
      (viewport.height * 0.7) / base / Math.max(1, bounds.bottom - bounds.top),
    ),
  );
  return cameraAt(
    {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    },
    zoom,
  );
}
// Only allocate new anchors; existing teacher/imported layouts are never rearranged.
export function nextPlanetPosition(entries: UniverseEntry[], seed: number) {
  for (let i = entries.length; i < entries.length + 2000; i++) {
    const angle = i * Math.PI * (3 - Math.sqrt(5)) + seed * 0.01;
    const radius = 330 * Math.sqrt(i + 1);
    const point = {
      x: 800 + Math.cos(angle) * radius,
      y: 450 + Math.sin(angle) * radius * 0.78,
    };
    if (
      point.x >= CLASSROOM_BOUNDS.left + 600 &&
      point.x <= CLASSROOM_BOUNDS.right - 600 &&
      point.y >= CLASSROOM_BOUNDS.top + 600 &&
      point.y <= CLASSROOM_BOUNDS.bottom - 600 &&
      entries.every(
        (e) => Math.hypot(e.position.x - point.x, e.position.y - point.y) > 460,
      )
    )
      return point;
  }
  throw new Error("班级星域暂时没有合适的位置，请老师调整布局后再创建。");
}
