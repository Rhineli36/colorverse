import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
const base =
  "C:/Users/Administrator/.codex/generated_images/01a11ec4-be3c-7e12-a3e5-37d1c5263833/";
const files = {
  "red-vermilion": "exec-e6b3d03e-2bb8-4466-8023-0253e4b43a98.png",
  "red-blush": "exec-2dbcbb9c-6b99-48cc-9ec4-a6049e9ad114.png",
  "red-wine": "exec-29d2b572-596a-42c5-a9e9-a6f3135708ca.png",
  "red-dusty-rose": "exec-0895c983-86bf-4783-b5c9-04bc37b000d9.png",
};
const out = "apps/web/public/emotion-cases";
await mkdir(out, { recursive: true });
const path = "packages/contracts/src/emotion-cases.json",
  content = JSON.parse(await readFile(path, "utf8"));
for (const [id, file] of Object.entries(files)) {
  await sharp(base + file)
    .resize({
      width: 1600,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 87 })
    .toFile(`${out}/${id}.webp`);
  await sharp(base + file)
    .resize({
      width: 560,
      height: 420,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toFile(`${out}/${id}-thumb.webp`);
  const c = content.groups.flatMap((g) => g.cases).find((c) => c.id === id);
  c.image.status = "ready";
  c.image.source =
    "2026-10-15 使用内置 imagegen 生成，经人工图文核对；非学生作品";
}
await writeFile(path, JSON.stringify(content, null, 2) + "\n");
await writeFile(
  `${out}/resource-record.json`,
  JSON.stringify(
    {
      version: 1,
      method: "imagegen",
      generatedAt: "2026-10-15",
      sharedPrompt:
        "用于高校设计色彩学习的艺术化抽象星球内部场景，大块形体、简洁空间；构图、光线、形状与颜色共同表达情感，无文字和水印；横向4:3。",
      resources: content.groups
        .flatMap((g) => g.cases)
        .map((c) => ({
          id: c.id,
          status: c.image.status,
          prompt: c.prompt,
          image: c.image.path,
          thumbnail: c.image.thumbnail,
          source: c.image.source,
        })),
    },
    null,
    2,
  ) + "\n",
);
console.log("Emotion assets: 4 ready, 19 explicitly pending.");
