import { z } from "zod";

export const WEIGHT_COLORS = [
  "#EFE5CF",
  "#29445B",
  "#CE694A",
  "#73866A",
] as const;
export const WEIGHT_NAMES = ["米白", "深蓝", "陶橙", "灰绿"];
export const WeightSceneSchema = z.object({
  composition: z.literal("window-vase-v1"),
  curtain: z.number().int().min(12).max(48),
  palette: z.tuple([
    z.literal("#EFE5CF"),
    z.literal("#29445B"),
    z.literal("#CE694A"),
    z.literal("#73866A"),
  ]),
});
export type WeightScene = z.infer<typeof WeightSceneSchema>;
export const weightDefault = (): WeightScene => ({
  composition: "window-vase-v1",
  curtain: 28,
  palette: [...WEIGHT_COLORS],
});
export const WeightDocumentSchema = z.object({
  version: z.literal(1),
  current: WeightSceneSchema,
  saved: z
    .array(z.object({ id: z.string().max(80), scene: WeightSceneSchema }))
    .max(2),
});
export type WeightDocument = z.infer<typeof WeightDocumentSchema>;
export const WEIGHT_STORAGE = "colorverse.color-lab.weight.v1";
export function readWeight(): WeightDocument {
  try {
    return WeightDocumentSchema.parse(
      JSON.parse(localStorage.getItem(WEIGHT_STORAGE) ?? "null"),
    );
  } catch {
    return { version: 1, current: weightDefault(), saved: [] };
  }
}
// One scene description feeds SVG display, classification and PNG export in identical order.
export function weightPaths(scene: WeightScene) {
  const edge = scene.curtain * 12;
  return [
    { color: 0, d: "M0 0H1200V750H0Z" },
    {
      color: 1,
      d: `M0 0H${edge}C${edge - 18} 150 ${edge + 24} 240 ${edge + 8} 360S${edge - 10} 560 ${edge + 12} 750H0Z`,
    },
    { color: 1, d: "M995 0H1011V236H1200V252H995Z" },
    { color: 1, d: "M0 568H1200V750H0Z" },
    {
      color: 2,
      d: "M783 421C788 411 854 411 860 421C858 433 842 447 844 469C845 493 884 511 902 535C936 582 912 643 882 675C880 686 770 686 765 675C739 631 716 586 743 543C758 516 797 495 799 470C801 448 788 434 783 421Z",
    },
    {
      color: 3,
      d: "M817 421C812 347 783 264 748 195L756 192C797 262 824 342 826 421Z",
    },
    {
      color: 3,
      d: "M815 380C761 315 683 270 675 272L672 280C689 282 754 325 815 394Z",
    },
    {
      color: 3,
      d: "M820 391C841 304 887 248 894 230L899 237C883 264 846 325 826 404Z",
    },
    {
      color: 3,
      d: "M747 207C678 205 676 131 606 113C676 83 754 125 765 180C768 194 761 203 747 207Z",
    },
    {
      color: 3,
      d: "M688 279C614 228 566 264 499 253C535 225 548 170 610 178C663 182 681 228 688 279Z",
    },
    {
      color: 3,
      d: "M781 315C728 299 665 321 652 375C640 416 620 427 609 451C679 430 742 403 753 355C757 337 768 322 781 315Z",
    },
    {
      color: 3,
      d: "M842 329C824 268 848 210 884 157C918 107 962 115 1000 105C960 139 969 172 926 202C898 223 869 248 842 329Z",
    },
    {
      color: 3,
      d: "M862 303C923 266 980 290 1004 334C1027 372 1051 377 1064 406C1011 387 991 371 952 369C907 366 895 325 862 303Z",
    },
  ];
}
export function weightSvg(scene: WeightScene) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" width="1200" height="750">${weightPaths(
    scene,
  )
    .map((p) => `<path fill="${scene.palette[p.color]}" d="${p.d}"/>`)
    .join("")}</svg>`;
}
export function roundedAreas(counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) throw Error("EMPTY_AREA");
  const values = counts.map((v) => (v / total) * 1000),
    tenths = values.map(Math.floor);
  const order = values
    .map((v, i) => ({ i, remainder: v - tenths[i] }))
    .sort((a, b) => b.remainder - a.remainder);
  const missing = 1000 - tenths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < missing; i++) tenths[order[i].i]++;
  return tenths.map((v) => v / 10);
}
