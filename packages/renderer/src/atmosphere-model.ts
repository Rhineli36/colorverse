// Deterministic visual schedules; these never alter saved planet/layout data.
export const ATMOSPHERE_BUDGET = {
  normal: {
    textureWidth: 768,
    textureHeight: 512,
    glints: 24,
    dust: 48,
    wanderers: 24,
  },
  low: {
    textureWidth: 384,
    textureHeight: 256,
    glints: 10,
    dust: 16,
    wanderers: 8,
  },
} as const;

// Twice the previous width/height: four times the explorable nebula area.
// These are world units, independent of the decoded image/GPU texture size.
export const UNIVERSE_PANORAMA = {
  width: 16000,
  height: 9000,
  centerX: 800,
  centerY: 450,
} as const;

/** Project one fixed world panorama with exactly the planets' camera transform. */
export function panoramaFrame(worldScale: number, x: number, y: number) {
  const p = UNIVERSE_PANORAMA;
  return {
    width: p.width * worldScale,
    height: p.height * worldScale,
    x: x + (p.centerX - p.width / 2) * worldScale,
    y: y + (p.centerY - p.height / 2) * worldScale,
  };
}

const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export function nebulaNoise(x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u;
  const b = hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u;
  return a * (1 - v) + b * v;
}

export interface MeteorFrame {
  x: number;
  y: number;
  angle: number;
  length: number;
  alpha: number;
}
const starts: number[] = [];
export function meteorStart(cycle: number): number {
  for (let i = starts.length; i <= cycle; i++)
    starts.push((starts[i - 1] ?? 0) + 90 + hash(i, 51) * 30);
  return starts[cycle];
}
export function meteorFrame(seconds: number): MeteorFrame | null {
  if (!Number.isFinite(seconds) || seconds < meteorStart(0)) return null;
  let cycle = Math.max(0, Math.floor(seconds / 120) - 1);
  while (meteorStart(cycle + 1) <= seconds) cycle++;
  const age = seconds - meteorStart(cycle);
  const duration = 1.65;
  if (age >= duration) return null;
  const progress = age / duration;
  const seed = hash(cycle, 98);
  const angle = 0.27 + hash(cycle, 32) * 0.42;
  const direction = hash(cycle, 13) > 0.5 ? 1 : -1;
  return {
    x: 0.24 + seed * 0.5 + progress * 0.16 * direction,
    y: 0.13 + hash(cycle, 7) * 0.43 + progress * 0.16,
    angle: direction > 0 ? angle : Math.PI - angle,
    length: 0.13 * Math.sin(Math.PI * progress),
    alpha: Math.sin(Math.PI * progress) * 0.85,
  };
}

export function ambientStarPosition(
  x: number,
  y: number,
  phase: number,
  seconds: number,
) {
  return {
    x:
      x +
      Math.sin(seconds * 0.027 + phase) * 130 +
      Math.cos(seconds * 0.041 + phase * 1.7) * 65,
    y:
      y +
      Math.cos(seconds * 0.023 + phase * 2.1) * 100 +
      Math.sin(seconds * 0.036 + phase) * 45,
  };
}
