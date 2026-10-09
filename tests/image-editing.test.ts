import { describe, it, expect } from "vitest";
import { fixturePlanet } from "@colorverse/fixtures";
import {
  validatePlanet,
  imageBounds,
  resizeImage,
  scaleImage,
  planetFrame,
  fitImage,
  visibleImageOpacity,
} from "@colorverse/domain";
import { useEditor } from "../apps/web/src/features/studio/editor-store";
describe("non-destructive image geometry", () => {
  it("keeps the exterior frame independent of image movement, scale and crop", () => {
    const scene = fixturePlanet(0).exterior.scene;
    const before = planetFrame(scene);
    scene.layers[0].transform = {
      ...scene.layers[0].transform,
      x: 1300,
      scaleX: 2,
      scaleY: 0.3,
      rotationDeg: 73,
    };
    expect(planetFrame(scene)).toEqual(before);
    expect(before).toEqual({ x: 800, y: 450, diameter: 400 });
  });
  it("fits artwork to the fixed frame and contains cropped interior images without stretching", () => {
    const p = fixturePlanet(0),
      layer = p.exterior.scene.layers[0];
    const fit = fitImage(layer, 800, 400, p.exterior.scene, true);
    expect(fit).toMatchObject({
      x: 800,
      y: 450,
      scaleX: 0.5,
      scaleY: 0.5,
      rotationDeg: 0,
    });
    if ("assetId" in layer.source)
      layer.source.crop = { x: 0.5, y: 0, width: 0.5, height: 1 };
    const inside = fitImage(layer, 800, 400, p.interior, false);
    expect(inside).toMatchObject({
      x: 350,
      y: 450,
      scaleX: 2.25,
      scaleY: 2.25,
      rotationDeg: 0,
    });
    const bounds = imageBounds(layer, 800, 400);
    expect(inside.x + (bounds.left + bounds.width / 2) * inside.scaleX).toBe(
      800,
    );
  });
  it("enforces exterior visibility including legacy zero and animated alpha while allowing clear interiors", () => {
    expect(visibleImageOpacity(0, true)).toBe(0.5);
    expect(visibleImageOpacity(0.3 * 0.6, true)).toBe(0.5);
    expect(visibleImageOpacity(0.8, true)).toBe(0.8);
    expect(visibleImageOpacity(0, false)).toBe(0);
    expect(visibleImageOpacity(2, true)).toBe(1);
  });
  it("accepts existing full images and rejects out-of-range crops or missing capability", () => {
    const p = fixturePlanet(0),
      l = p.exterior.scene.layers[0];
    expect(validatePlanet(p)).toEqual(p);
    if (!("assetId" in l.source)) throw new Error("fixture");
    l.source.crop = { x: 0.2, y: 0.1, width: 0.6, height: 0.8 };
    expect(() => validatePlanet(p)).toThrow(/image-crop/);
    p.requiredCapabilities.push("image-crop@1");
    expect(validatePlanet(p)).toEqual(p);
    l.source.crop.width = 0.9;
    expect(() => validatePlanet(p)).toThrow(/裁剪/);
  });
  it("keeps the original coordinate system and anchor while trimming visible bounds", () => {
    const l = fixturePlanet(0).exterior.scene.layers[0];
    if ("assetId" in l.source)
      l.source.crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
    expect(imageBounds(l, 1000, 500)).toEqual({
      left: -250,
      top: -200,
      width: 500,
      height: 400,
    });
  });
  it("scales both axes proportionally even after a stretch, within schema limits", () => {
    const t = fixturePlanet(0).exterior.scene.layers[0].transform;
    t.scaleX = 2;
    t.scaleY = 0.8;
    expect(scaleImage(t, 1.5).scaleX).toBeCloseTo(3);
    expect(scaleImage(t, 1.5).scaleY).toBeCloseTo(1.2);
    expect(scaleImage(t, 100)).toMatchObject({ scaleX: 10, scaleY: 4 });
    expect(scaleImage(t, -1).scaleX).toBeCloseTo(0.025);
    expect(scaleImage(t, -1).scaleY).toBeCloseTo(0.01);
  });
  it("resizes a rotated cropped layer while keeping the opposite corner fixed", () => {
    const l = fixturePlanet(0).exterior.scene.layers[0];
    l.transform.rotationDeg = 37;
    const b = imageBounds(l, 512, 512),
      t = l.transform,
      n = resizeImage(t, b, 80, 55, "both", false);
    const corner = (v: typeof t) => ({
      x:
        v.x +
        Math.cos((37 * Math.PI) / 180) * b.left * v.scaleX -
        Math.sin((37 * Math.PI) / 180) * b.top * v.scaleY,
      y:
        v.y +
        Math.sin((37 * Math.PI) / 180) * b.left * v.scaleX +
        Math.cos((37 * Math.PI) / 180) * b.top * v.scaleY,
    });
    expect(corner(n).x).toBeCloseTo(corner(t).x);
    expect(corner(n).y).toBeCloseTo(corner(t).y);
    expect(n.scaleX).not.toBe(t.scaleX);
  });
  it("locks corner resizing to the original aspect ratio and stretches one edge separately", () => {
    const l = fixturePlanet(0).exterior.scene.layers[0],
      b = imageBounds(l, 800, 400),
      t = l.transform;
    const n = resizeImage(t, b, 150, 50, "both", true);
    expect(n.scaleX / n.scaleY).toBeCloseTo(t.scaleX / t.scaleY);
    expect(resizeImage(t, b, 100, 0, "x", false).scaleY).toBe(t.scaleY);
  });
  it("undo removes an optional crop exactly and redo restores it without changing assets", () => {
    const p = fixturePlanet(0);
    useEditor.getState().load(p);
    useEditor.getState().change((p) => {
      p.requiredCapabilities.push("image-crop@1");
      const s = p.exterior.scene.layers[0].source;
      if ("assetId" in s) s.crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
    });
    expect(useEditor.getState().document!.assetRefs).toEqual(p.assetRefs);
    useEditor.getState().undo();
    expect(useEditor.getState().document).toEqual(p);
    useEditor.getState().redo();
    expect(
      useEditor.getState().document!.exterior.scene.layers[0].source,
    ).toHaveProperty("crop.width", 0.6);
  });
});
