import sharp from "sharp";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// Run explicitly with the two owner-supplied files; originals stay outside the repo.
const files = process.argv.slice(2);
if (files.length !== 2)
  throw Error("Pass hue and lightness image paths, in that order.");
const out = new URL("../apps/web/public/knowledge-examples/", import.meta.url);
await mkdir(out, { recursive: true });
const records = [];
for (const [index, name] of ["hue-ribbon", "lightness-staircase"].entries()) {
  const source = await readFile(files[index]);
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
  records.push({
    id: "K0" + (index + 1),
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
  new URL("resource-record.json", out),
  JSON.stringify(records, null, 2) + "\n",
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
