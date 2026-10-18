import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { expect, it } from "vitest";
import {
  EmotionContent,
  CloudPlanetDocumentSchema,
} from "@colorverse/contracts";
import { planetAppearancePayload } from "../apps/web/src/features/classroom/planet-appearance-payload";

it("ships all 23 supplied emotion images with uncropped proportions and fingerprinted URLs", async () => {
  const record = JSON.parse(
    await readFile(
      "apps/web/public/emotion-cases/resource-record.json",
      "utf8",
    ),
  );
  const cases = EmotionContent.groups.flatMap((g) => g.cases);
  expect(record.method).toBe("owner-supplied");
  expect(record.resources).toHaveLength(23);
  let bytes = 0;
  for (const item of cases) {
    expect(item.image.status).toBe("ready");
    const source = record.resources.find(
      (r: { id: string }) => r.id === item.id,
    );
    expect(item.image.path).toContain(source.sourceSha256.slice(0, 12));
    for (const path of [item.image.path, item.image.thumbnail]) {
      const file = `apps/web/public/${path}`;
      const meta = await sharp(file).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(meta.width! / meta.height!).toBeCloseTo(4 / 3, 3);
      bytes += (await stat(file)).size;
    }
  }
  expect(bytes).toBeLessThan(7_000_000);
  const names = Object.fromEntries(
    record.resources.map((r: { id: string; sourceFile: string }) => [
      r.id,
      r.sourceFile,
    ]),
  );
  expect(names["green-mint"]).toBe("11深森林绿.png");
  expect(names["green-forest"]).toBe("10薄荷绿.png");
  expect(names["blue-cyan-aqua"]).toBe("15灰蓝.png");
  expect(names["blue-cyan-midnight"]).toBe("13浅天蓝.png");
});

it("keeps server-owned media, layout and visibility out of appearance saves", () => {
  const document = CloudPlanetDocumentSchema.parse({
    visible: false,
    metadata: { name: "我的星球", summary: "原寄语" },
    position: { x: 32, y: 44 },
    revision: 9,
  });
  const original = structuredClone(document);
  const payload = planetAppearancePayload(document);
  expect(payload.name).toBe("我的星球");
  expect(payload.summary).toBe("原寄语");
  for (const key of ["visible", "media", "position", "revision", "metadata"])
    expect(payload).not.toHaveProperty(key);
  expect(document).toEqual(original);
});
