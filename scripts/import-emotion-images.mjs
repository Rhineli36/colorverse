import { readFile, readdir, writeFile, mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const directory = process.argv[2];
if (!directory)
  throw Error("Pass the directory containing numbered images 1–23.");
const contentPath = "packages/contracts/src/emotion-cases.json";
const content = JSON.parse(await readFile(contentPath, "utf8"));
const cases = content.groups.flatMap((g) => g.cases);
const files = (await readdir(directory)).filter((file) =>
  /^\d+.+\.png$/i.test(file),
);
if (files.length !== 23 || cases.length !== 23)
  throw Error("Expected exactly 23 numbered source images and cases.");
// These six delivered filenames are shifted; match the actual scene/color.
const correctedSource = { 10: 11, 11: 10, 12: 15, 13: 14, 14: 13, 15: 12 };
const scenes = [
  "朱红的飘带、灯笼与舞动的人物相互呼应，明亮的光线和舒展的姿态让画面带有庆祝的气息。",
  "浅粉色花影包围相拥的人物，柔和光线、轻柔的衣料和靠近的姿态共同传递关怀。",
  "暗酒红色衣裙与深色室内相连，人物脸部的光与厚重的衣料形成层次，可联想到庄重与深情。",
  "灰玫瑰色墙面、空椅与桌上的信件留出安静空间，斜照的光影让人联想到等待和牵挂。",
  "鲜橙色遮阳伞、衣着与桌面构成温暖的聚会场景，人物的交流和明亮日光一起表现欢聚。",
  "浅杏橙色沙发、柔软织物与暖光围合成舒适角落，低强度的色彩差异带来亲近感。",
  "明黄色拱廊、台阶和远处建筑形成可探索的空间，明亮色块和延伸路径表现明快与好奇。",
  "奶油黄的窗帘、桌布和花瓶承接柔和日光，浅色层次让日常静物显得舒缓而有希望。",
  "嫩黄绿的新叶迎着光展开，浅亮背景与清晰叶脉共同表现萌动与生机。",
  "薄荷绿衣着、轻透窗帘与窗外植物相互呼应，明亮空气感和舒展姿态营造清爽的氛围。",
  "深森林绿的林木、苔藓与阴影包围一条小径，少量透光让幽静空间仍有可以前行的方向。",
  "清青色透明曲面折射光线，水纹、反光和连续的弧线共同呈现清透与流动。",
  "浅天蓝天空、云朵与开阔山景留出远方，山路和小小滑翔伞让人联想到轻盈与自由。",
  "深夜蓝的海面与天空连成辽阔暗色空间，地平线的一点光让深远与孤独更加可感。",
  "灰蓝色人物、窗边桌面与远处城市保持克制的色彩关系，静止姿态和书写场景引出沉思。",
  "浅薰衣草紫的拱廊、山景和水中倒影相连，轻柔光线与虚实层次营造梦幻空间。",
  "鲜紫衣裙与舞者伸展的姿态形成流动节奏，光下的布料与深色背景带来张力和个性。",
  "深紫色弯曲廊道通向一道微光，遮挡关系和未显露的空间让人联想到神秘与未知。",
  "蜂蜜浅棕的面包、陶碗与木桌在暖光中彼此呼应，朴素材质让日常场景显得温暖而熟悉。",
  "深土棕的土屋与山地保持接近的色调，粗糙肌理和厚实形体共同表现朴实与安定。",
  "暖白色拱门、台阶与曲面接住日光，浅色阴影和开放路径让空间显得轻盈而通透。",
  "中性灰的立柱、墙面与地砖形成重复秩序，远处亮面和近处阴影帮助辨认深度。",
  "炭黑色石块以不同高低聚合，侧光勾出表面与轮廓，厚重体量让人联想到庄严与凝聚。",
];
const mapped = cases.map((item, index) => {
  const sourceNumber = correctedSource[index + 1] ?? index + 1;
  const matches = files.filter(
    (file) => Number(file.match(/^\d+/)[0]) === sourceNumber,
  );
  if (matches.length !== 1) throw Error(`Image number mismatch for ${item.id}`);
  item.scene = scenes[index];
  return { item, file: matches[0] };
});
const out = "apps/web/public/emotion-cases";
await mkdir(out, { recursive: true });
const resources = [];
for (const { item, file } of mapped) {
  const source = await readFile(resolve(directory, file));
  const digest = createHash("sha256").update(source).digest("hex");
  const baseName = `${item.id}-${digest.slice(0, 12)}`;
  const image = sharp(source).rotate().toColourspace("srgb");
  const full = await image
    .clone()
    .resize({
      width: 1600,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 87 })
    .toFile(`${out}/${baseName}.webp`);
  const thumb = await image
    .clone()
    .resize({
      width: 600,
      height: 450,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 81 })
    .toFile(`${out}/${baseName}-thumb.webp`);
  item.image.status = "ready";
  item.image.path = `emotion-cases/${baseName}.webp`;
  item.image.thumbnail = `emotion-cases/${baseName}-thumb.webp`;
  item.image.source = "课程负责人提供，2026-10-18 实装";
  item.image.alt = `${item.name}：${item.emotion}的图像案例`;
  resources.push({
    id: item.id,
    name: item.name,
    sourceFile: file,
    sourceSha256: digest,
    image: item.image.path,
    thumbnail: item.image.thumbnail,
    width: full.width,
    height: full.height,
    bytes: full.size,
    thumbnailBytes: thumb.size,
    source: item.image.source,
  });
}
await writeFile(contentPath, JSON.stringify(content, null, 2) + "\n");
const used = new Set(
  resources.flatMap((r) => [
    r.image.split("/").pop(),
    r.thumbnail.split("/").pop(),
  ]),
);
for (const file of await readdir(out)) {
  if (
    !used.has(file) &&
    cases.some((c) =>
      new RegExp(`^${c.id}(?:-[a-f0-9]{12})?(?:-thumb)?\\.webp$`).test(file),
    )
  )
    await unlink(resolve(out, file));
}
await writeFile(
  `${out}/resource-record.json`,
  JSON.stringify(
    {
      version: 2,
      method: "owner-supplied",
      importedAt: "2026-10-18",
      resources,
    },
    null,
    2,
  ) + "\n",
);
await mkdir("outputs/emotion-final", { recursive: true });
await writeFile(
  "outputs/emotion-final/contact-sheet.html",
  `<!doctype html><meta charset="utf-8"><style>body{margin:15px;background:#102030;color:white;font:16px 'Microsoft YaHei';display:grid;grid-template-columns:repeat(5,1fr);gap:12px}figure{margin:0}img{width:100%;aspect-ratio:3/2;object-fit:contain}figcaption{padding:5px}</style>${resources.map((r, i) => `<figure><img src="../../apps/web/public/${r.thumbnail}"><figcaption>${i + 1} ${r.name}</figcaption></figure>`).join("")}`,
);
console.log(
  JSON.stringify({
    count: resources.length,
    totalBytes: resources.reduce((n, r) => n + r.bytes + r.thumbnailBytes, 0),
    dimensions: [...new Set(resources.map((r) => `${r.width}x${r.height}`))],
  }),
);
