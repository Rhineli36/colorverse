import sharp from "sharp";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// Pass K01–K02, K03–K07, or all seven supplied files in topic order.
const files = process.argv.slice(2);
if (![2, 5, 7].includes(files.length))
  throw Error("Pass 2, 5 or 7 image paths in topic order.");
const out = new URL("../apps/web/public/knowledge-examples/", import.meta.url);
await mkdir(out, { recursive: true });
const recordFile = new URL("resource-record.json", out);
let records = [];
try {
  records = JSON.parse(await readFile(recordFile, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const names = [
  "hue-ribbon",
  "lightness-staircase",
  "saturation-portrait",
  "temperature-window",
  "analogous-leaves",
  "contrast-bird",
  "area-sailboat",
];
const start = files.length === 5 ? 2 : 0;
for (const [index, file] of files.entries()) {
  const name = names[start + index];
  const source = await readFile(file);
  const image = sharp(source).rotate().toColourspace("srgb");
  const full = await image
    .clone()
    .resize({
      width: 1536,
      height: 1536,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 88 })
    .toFile(fileURLToPath(new URL(name + ".webp", out)));
  const thumb = new URL(name + "-thumb.webp", out);
  await image
    .clone()
    .resize({
      width: 600,
      height: 600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toFile(fileURLToPath(thumb));
  const id = "K0" + (start + index + 1);
  records = records.filter((r) => r.id !== id);
  records.push({
    id,
    image: name + ".webp",
    thumbnail: name + "-thumb.webp",
    width: full.width,
    height: full.height,
    bytes: full.size,
    thumbnailBytes: (await stat(thumb)).size,
    source: "课程负责人提供",
    sourceSha256: createHash("sha256").update(source).digest("hex"),
  });
}
await writeFile(
  recordFile,
  JSON.stringify(
    records.sort((a, b) => a.id.localeCompare(b.id)),
    null,
    2,
  ) + "\n",
);
console.log(
  records.map(({ id, width, height, bytes, thumbnailBytes }) => ({
    id,
    width,
    height,
    bytes,
    thumbnailBytes,
  })),
);
