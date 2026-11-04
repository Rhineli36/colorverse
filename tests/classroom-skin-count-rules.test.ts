import { describe, expect, it } from "vitest";
import {
  eligibleCountSkins,
  type SkinCountEvidence,
} from "../apps/worker/src/classroom-skin-rules";
const base: SkinCountEvidence = {
  exteriorUploaded: false,
  interiorUploaded: false,
  interactions: 0,
  receivedLikes: 0,
  submittedAssignments: 0,
};
describe("next-phase skin count boundary specification (not enabled online)", () => {
  it("requires both actual custom uploads, not either upload or defaults", () => {
    expect(eligibleCountSkins(base)).toEqual([]);
    expect(
      eligibleCountSkins({ ...base, exteriorUploaded: true }),
    ).not.toContain("silver");
    expect(
      eligibleCountSkins({ ...base, interiorUploaded: true }),
    ).not.toContain("silver");
    expect(
      eligibleCountSkins({
        ...base,
        exteriorUploaded: true,
        interiorUploaded: true,
      }),
    ).toContain("silver");
  });
  it.each([
    ["gold", "interactions", 20],
    ["floral", "interactions", 50],
    ["sapphire", "receivedLikes", 10],
    ["emerald", "submittedAssignments", 5],
    ["glass", "submittedAssignments", 10],
  ] as const)(
    "%s unlocks at the exact agreed threshold",
    (skin, key, threshold) => {
      expect(
        eligibleCountSkins({ ...base, [key]: threshold - 1 }),
      ).not.toContain(skin);
      expect(eligibleCountSkins({ ...base, [key]: threshold })).toContain(skin);
      expect(eligibleCountSkins({ ...base, [key]: threshold + 1 })).toContain(
        skin,
      );
    },
  );
  it("never awards winter or an undecided ring through aggregate counts", () => {
    expect(
      eligibleCountSkins({
        exteriorUploaded: true,
        interiorUploaded: true,
        interactions: 999,
        receivedLikes: 999,
        submittedAssignments: 999,
      }),
    ).toEqual(["silver", "gold", "sapphire", "emerald", "glass", "floral"]);
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid evidence %s",
    (count) => {
      expect(() =>
        eligibleCountSkins({ ...base, interactions: count }),
      ).toThrow("INVALID_SKIN_EVIDENCE");
    },
  );
});
