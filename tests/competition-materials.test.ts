import { describe, expect, it } from "vitest";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { AssignmentCatalog } from "@colorverse/contracts";
const root = "apps/web/public/competition";
describe("public competition material boundaries", () => {
  it("ships three distinct assignment comparisons with complete original proportions and optimized local bytes", async () => {
    expect(AssignmentCatalog.map((task) => task.id)).toEqual([
      "T01",
      "T02",
      "T03",
    ]);
    expect(new Set(AssignmentCatalog.map((task) => task.image)).size).toBe(3);
    let bytes = 0;
    for (const task of AssignmentCatalog) {
      expect(task.image).toMatch(/^assignments\/[a-z-]+\.webp$/);
      const path = "apps/web/public/" + task.image;
      const meta = await sharp(path).metadata();
      expect([meta.width, meta.height]).toEqual([1536, 1024]);
      expect(meta.exif).toBeUndefined();
      bytes += (await stat(path)).size;
    }
    expect(bytes).toBeLessThan(1_200_000);
  });
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
    const authors = new Set(["默认风格"]);
    for (const [index, student] of snapshot.students.entries()) {
      expect(student.realName).toBe(
        `虚拟学生 ${String(index + 1).padStart(2, "0")}`,
      );
      expect(student.studentNumber).toBe(
        `DEMO${String(index + 1).padStart(4, "0")}`,
      );
      expect(student.display_name).toBe(
        `${student.realName} · 学号 ${student.studentNumber}`,
      );
      authors.add(student.realName);
      authors.add(student.display_name);
    }
    const inspectAuthors = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (key === "author" && typeof item === "string")
          expect(authors.has(item.replace(/（演示账号）/g, ""))).toBe(true);
        inspectAuthors(item);
      }
    };
    inspectAuthors(snapshot);
    expect(text).not.toMatch(/\b\d{8,}\b/);
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
