// Resize/compress selected built-in imagegen outputs; preserve their alpha.
// node scripts/prepare-default-art.mjs planet0.png ... planet5.png panorama.png
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const sources = process.argv.slice(2);
if (sources.length !== 7)
  throw new Error("Expected six planet images and one panorama");
const root = resolve(import.meta.dirname, ".."),
  out = resolve(root, "apps/web/public/demo/v2"),
  backgrounds = resolve(root, "packages/renderer/src/assets");
await mkdir(out, { recursive: true });
await mkdir(backgrounds, { recursive: true });
const info = (buffer) => ({
  sha256: createHash("sha256").update(buffer).digest("hex"),
  byteSize: buffer.length,
});
const bodies = [];
for (let i = 0; i < 6; i++) {
  const original = await sharp(sources[i])
      .resize(512, 512, { fit: "inside" })
      .webp({ quality: 92 })
      .toBuffer(),
    thumbnail = await sharp(original)
      .resize(256, 256)
      .webp({ quality: 88 })
      .toBuffer();
  await writeFile(resolve(out, `body-${i}.webp`), original);
  await writeFile(resolve(out, `body-${i}-thumb.webp`), thumbnail);
  bodies.push({
    ...info(original),
    thumbnail: info(thumbnail),
    previousSha256: info(
      await readFile(resolve(root, `apps/web/public/demo/body-${i}.png`)),
    ).sha256,
  });
}
const panorama = await sharp(sources[6])
    .resize(2048, 1152, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer(),
  low = await sharp(panorama)
    .resize(1024, 576)
    .webp({ quality: 80 })
    .toBuffer();
await writeFile(resolve(backgrounds, "universe-v2.webp"), panorama);
await writeFile(resolve(backgrounds, "universe-v2-low.webp"), low);
await writeFile(
  resolve(root, "apps/web/src/app/demo-assets.json"),
  JSON.stringify(
    {
      version: "demo-v2",
      bodies,
      panorama: info(panorama),
      lowPanorama: info(low),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    bodies: bodies.map((b) => b.byteSize),
    panorama: panorama.length,
    low: low.length,
  }),
);
