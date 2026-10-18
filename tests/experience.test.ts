import { describe, it, expect } from "vitest";
import {
  imageGeometry,
  resetImagePlacement,
  StudentIdentitySchema,
  reviewStatus,
  hasTeacherReview,
  identityFromDisplayName,
  CloudPlanetDocumentSchema,
  cloudPlanetFromPreset,
} from "@colorverse/contracts";
describe("precompetition identity, placement and review status", () => {
  it("trims identity without treating student numbers as numeric", () => {
    expect(
      StudentIdentitySchema.parse({
        studentNumber: " 00123 ",
        realName: " 小王 ",
      }),
    ).toEqual({ studentNumber: "00123", realName: "小王" });
    expect(
      StudentIdentitySchema.safeParse({ studentNumber: " ", realName: "小王" })
        .success,
    ).toBe(false);
    expect(identityFromDisplayName("小王 · 学号 00123")).toEqual({
      studentNumber: "00123",
      realName: "小王",
    });
  });
  it("uses the same proportional crop at different preview and saved display sizes", () => {
    const p = { x: 0.2, y: -0.1, scale: 1.7 };
    const a = imageGeometry(1500, 1000, 400, 250, p),
      b = imageGeometry(1500, 1000, 1600, 1000, p);
    for (const k of ["width", "height", "left", "top"] as const)
      expect(b[k]).toBeCloseTo(a[k] * 4);
    const reset = imageGeometry(1500, 1000, 100, 100, resetImagePlacement());
    expect(reset).toEqual({ width: 150, height: 100, left: -25, top: 0 });
  });
  it("loads old documents and retains independent exterior and interior transforms", () => {
    const p = cloudPlanetFromPreset(0);
    delete (p as Partial<typeof p>).imagePlacement;
    expect(CloudPlanetDocumentSchema.parse(p).imagePlacement).toEqual({});
    const value = {
      ...p,
      imagePlacement: {
        exterior: { x: 0.2, y: 0, scale: 2 },
        interior: { x: 0, y: 0.1, scale: 0.5 },
      },
    };
    expect(CloudPlanetDocumentSchema.parse(value).imagePlacement).toEqual(
      value.imagePlacement,
    );
  });
  it("distinguishes pending, comment only and a real zero score", () => {
    expect(reviewStatus(null, "")).toBe("待评价");
    expect(reviewStatus(undefined, "不错")).toBe("已有评语 · 暂未评分");
    expect(reviewStatus(0, "")).toBe("教师评分 0 分");
    expect(hasTeacherReview(0, "")).toBe(true);
    expect(hasTeacherReview(null, "  ")).toBe(false);
  });
});
