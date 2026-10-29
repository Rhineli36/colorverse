import { it, expect, vi } from "vitest";
import {
  TreeSchema,
  treeDefaults,
  treeMode,
  seasonPalette,
  readTree,
} from "../apps/web/src/features/color-lab/tree-state";
it("tree schema rejects invalid identities, colors, proportions and versions", () => {
  const d = treeDefaults();
  expect(TreeSchema.safeParse(d).success).toBe(true);
  expect(TreeSchema.safeParse({ ...d, schemaVersion: 2 }).success).toBe(false);
  expect(TreeSchema.safeParse({ ...d, target: "red" }).success).toBe(false);
  d.palettes[0].accent = 50;
  d.palettes[0].auxiliary = 80;
  expect(TreeSchema.safeParse(d).success).toBe(false);
});
it("legacy tree schemes keep palettes while reopening the fixed artwork paused", () => {
  const legacy = { ...treeDefaults(), paused: false, orbit: true };
  legacy.palettes[0].colors[0] = "#345678";
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(legacy) });
  try {
    const current = readTree();
    expect(current.palettes).toEqual(legacy.palettes);
    expect(current.paused).toBe(true);
    expect(current.orbit).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("same-color comparison locks animation and preserves palettes and shared camera", () => {
  const d = treeDefaults(),
    next = treeMode(d, "context");
  expect(next.paused && next.compare && !next.orbit).toBe(true);
  expect(next.palettes).toEqual(d.palettes);
  expect(next.camera).toEqual(d.camera);
  expect(seasonPalette(2).colors[0]).toBe("#E8AD3B");
});
