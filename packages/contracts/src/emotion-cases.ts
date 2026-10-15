import content from "./emotion-cases.json";
export const EmotionContent = content;
export type EmotionCase = (typeof content.groups)[number]["cases"][number];
export type EmotionFamily = (typeof content.groups)[number];
export function findEmotionCase(id?: string) {
  return content.groups
    .flatMap((g) => g.cases)
    .find((c) => c.id === (LegacyCaseLinks[id || ""] ?? id));
}
export function familyForLegacyCard(id: string) {
  return content.groups.find((g) => g.legacyIds.includes(id));
}

export const LegacyCaseLinks: Record<string, string> = {
  C01: "red-vermilion",
  C08: "red-blush",
  C02: "orange-tangerine",
  C03: "yellow-sunshine",
  C04: "green-mint",
  C05: "blue-cyan-sky",
  C06: "blue-cyan-aqua",
  C07: "purple-lavender",
  C09: "brown-honey",
  C10: "neutral-ivory",
  C11: "neutral-charcoal",
  C12: "neutral-gray",
};
