import { describe, expect, it } from "vitest";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
const root = "apps/web/public/competition";
describe("public competition material boundaries", () => {
  it("publishes anonymous cases, defaults and suggestions without classroom account identifiers", async () => {
    const text = await readFile(root + "/manifest.json", "utf8"),
      snapshot = JSON.parse(text);
    expect(snapshot.students).toHaveLength(5);
    expect(snapshot.defaults).toHaveLength(5);
    expect(
      snapshot.students.flatMap((s: { works: unknown[] }) => s.works),
    ).toHaveLength(25);
    expect(text).not.toMatch(
      /@|sb_secret_|sb_publishable_|eyJ|storage_key|auth_subject|enrollment|https?:\/\/|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/i,
    );
    for (const s of snapshot.students) {
      expect(s.document.media).toEqual({});
      expect(s.id).toMatch(/^demo-[1-5]$/);
      expect(
        s.works.every(
          (w: { score: number; comment: string }) =>
            w.score >= 0 && w.score <= 100 && w.comment.length > 0,
        ),
      ).toBe(true);
    }
  });
  it("ships all 35 local optimized images without source metadata and within the exhibition budget", async () => {
    const data = JSON.parse(await readFile(root + "/manifest.json", "utf8"));
    const names = data.students.flatMap(
      (s: {
        exterior: string;
        interior: string;
        works: { image: string }[];
      }) => [s.exterior, s.interior, ...s.works.map((w) => w.image)],
    );
    expect(new Set(names).size).toBe(35);
    let size = 0;
    for (const n of names) {
      expect(n).toMatch(/^[a-z0-9-]+\.webp$/);
      const path = root + "/" + n;
      size += (await stat(path)).size;
      const meta = await sharp(path).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.width! * meta.height!).toBeLessThanOrEqual(1920 * 1080);
    }
    expect(size).toBeLessThan(4_000_000);
  });
});
