import { KnowledgeExampleImages } from "./knowledge-example-images";
export const KnowledgeLabels: Record<string, string> = {
  K01: "色相",
  K02: "明度",
  K03: "纯度／彩度",
  K04: "冷暖",
  K05: "相近配色",
  K06: "对比配色",
  K07: "色彩面积",
};
export function KnowledgeVisual({ id }: { id: string }) {
  const image = KnowledgeExampleImages[id];
  if (!image) return null;
  return (
    <img
      className="knowledge-topic-image"
      src={`${import.meta.env.BASE_URL}knowledge-examples/${image.file}-thumb.webp`}
      alt={image.description}
      width={600}
      height={400}
      loading="lazy"
      decoding="async"
    />
  );
}
