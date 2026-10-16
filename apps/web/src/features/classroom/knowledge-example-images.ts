export const KnowledgeExampleImages: Record<
  string,
  { file: string; description: string }
> = {
  K01: { file: "hue-ribbon", description: "青色空间中的多彩曲面与圆球" },
  K02: {
    file: "lightness-staircase",
    description: "光影交错的旋转阶梯与人物剪影",
  },
};

export function knowledgeImageFilter(id: string, value: number) {
  if (id === "K01") return `hue-rotate(${((value % 360) + 360) % 360}deg)`;
  if (id === "K02")
    return `brightness(${Math.max(40, Math.min(160, value)) / 100})`;
  return "none";
}
