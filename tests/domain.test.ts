import { describe, it, expect } from "vitest";
import { fixturePlanet } from "@colorverse/fixtures";
import { validatePlanet, hitTest, filterPlanets } from "@colorverse/domain";
import { changes, applyChanges } from "../packages/domain/src/history";
describe("planet domain", () => {
  it("checks reference integrity and schema versions", () => {
    const p = fixturePlanet(0);
    expect(validatePlanet(p).metadata.name).toBe("日落收藏家");
    p.assetRefs = [];
    expect(() => validatePlanet(p)).toThrow("未声明");
    expect(() =>
      validatePlanet({ ...fixturePlanet(0), schemaVersion: "2.0.0" }),
    ).toThrow();
  });
  it("filters name, hue and emotions without loading images", () => {
    const list = Array.from({ length: 6 }, (_, i) => fixturePlanet(i));
    expect(filterPlanets(list, "日落", "all", "")).toHaveLength(1);
    expect(filterPlanets(list, "", "warm", "温暖")).toHaveLength(1);
  });
  it("maps rotated/scaled anchored hotspots", () => {
    const p = fixturePlanet(0),
      l = p.exterior.scene.layers[0];
    l.transform.x = 400;
    l.transform.y = 300;
    l.transform.scaleX = 2;
    l.transform.rotationDeg = 90;
    p.exterior.scene.hotspots = [
      {
        ...p.interior.hotspots[0],
        sceneId: p.exterior.scene.id,
        anchorLayerId: l.id,
        geometry: { type: "circle", x: 50, y: 0, radius: 5 },
      },
    ];
    expect(hitTest(p.exterior.scene, 400, 400)).toBeDefined();
    expect(hitTest(p.exterior.scene, 450, 300)).toBeUndefined();
  });
  it("undoes field changes while keeping persistence revision", () => {
    const p = fixturePlanet(0),
      next = structuredClone(p);
    next.metadata.name = "新的名字";
    next.exterior.scene.layers[0].opacity = 0.5;
    const patch = changes(p, next);
    expect(patch).toHaveLength(2);
    next.revision = 3;
    const undo = applyChanges(next, patch, "before");
    expect(undo.revision).toBe(3);
    expect(undo.metadata.name).toBe(p.metadata.name);
    expect(applyChanges(undo, patch, "after").metadata.name).toBe("新的名字");
  });
});
