import { describe, it, expect } from "vitest";
import { GrowthSchema, GrowthPresetIds } from "@colorverse/contracts";
import example from "../docs/examples/growth-event.accepted.json";
import draftSchema from "../docs/schemas/growth-event.schema.json";
import generatedSchema from "../docs/schemas/generated/growth.schema.json";
describe("growth contract", () => {
  it("keeps documented and generated preset catalogs aligned with the runtime registry", () => {
    expect(draftSchema.$defs.element.properties.presetId.enum).toEqual([
      ...GrowthPresetIds,
    ]);
    expect(
      generatedSchema.properties.elements.items.properties.presetId.enum,
    ).toEqual([...GrowthPresetIds]);
  });
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
