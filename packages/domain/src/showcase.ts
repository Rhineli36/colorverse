import {
  GrowthPresetIds,
  GrowthPresets,
  type ArchiveEntry,
  type GrowthEvent,
} from "@colorverse/contracts";

/** Versioned, bounded rules; no model call or grading. */
export function showcaseChoice(archive: ArchiveEntry, previous: GrowthEvent[]) {
  let seed = 2166136261;
  for (const c of archive.id + archive.colorTags.join("|"))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const words = `${archive.title} ${archive.description} ${archive.colorTags.join(" ")}`;
  const lower = words.toLowerCase();
  const weights = GrowthPresetIds.map((id) => {
    const relevance = GrowthPresets[id].keywords.some((word) =>
      lower.includes(word),
    );
    const repeats = previous.filter(
      (e) =>
        e.status === "accepted" && e.elements.some((el) => el.presetId === id),
    ).length;
    return Math.max(1, (relevance ? 8 : 2) - repeats * 2);
  });
  let draw = seed % weights.reduce((a, b) => a + b, 0);
  const index = weights.findIndex((weight) => {
    draw -= weight;
    return draw < 0;
  });
  return { seed, presetId: GrowthPresetIds[index] };
}

/** At most 32×32 sampled RGBA pixels; ignore transparent pixels. */
export function dominantColor(
  pixels: ArrayLike<number>,
  fallback: string,
): string {
  const bins = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i + 3 < Math.min(pixels.length, 4096); i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  const best = [...bins.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0] - b[0],
  )[0]?.[1];
  return best
    ? `#${[best.r, best.g, best.b]
        .map((v) =>
          Math.round(v / best.count)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`
    : fallback;
}
