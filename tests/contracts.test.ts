import { describe, it, expect } from "vitest";
import { GrowthSchema } from "@colorverse/contracts";
import example from "../docs/examples/growth-event.accepted.json";
describe("growth contract", () => {
  it("reads the architecture example", () =>
    expect(GrowthSchema.parse(example).elements[0].presetId).toBe(
      "glow-flower",
    ));
  it("rejects unsafe parameters and state contradictions", () => {
    expect(
      GrowthSchema.safeParse({ ...example, acceptedAt: null }).success,
    ).toBe(false);
    const invalid = structuredClone(example);
    invalid.elements[0].params.x = 2;
    expect(GrowthSchema.safeParse(invalid).success).toBe(false);
    expect(
      GrowthSchema.safeParse({
        ...example,
        elements: [{ ...example.elements[0], presetId: "script" }],
      }).success,
    ).toBe(false);
  });
});
