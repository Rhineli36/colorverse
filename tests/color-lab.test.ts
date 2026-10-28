import { describe, expect, it } from "vitest";
import {
  choosePreset,
  defaultSettings,
  restoreSettings,
  swatchColors,
} from "../apps/web/src/features/color-lab/lab-state";
describe("classroom color lab comparison state", () => {
  it("keeps each grayscale source and adjustments through grayscale round trips", () => {
    const original = {
      ...defaultSettings().colors[1],
      hue: 28,
      saturation: 83,
    };
    const gray = choosePreset(original, 3);
    expect(gray).toMatchObject({
      preset: 3,
      basePreset: 1,
      hue: 28,
      saturation: 83,
    });
    expect(choosePreset(gray, 3)).toEqual(original);
    const graySwatches = swatchColors(gray);
    expect(
      graySwatches.every(
        (hex) =>
          hex.slice(1, 3) === hex.slice(3, 5) &&
          hex.slice(3, 5) === hex.slice(5, 7),
      ),
    ).toBe(true);
    expect(swatchColors(original)).not.toEqual(graySwatches);
  });
  it("preserves literal preset swatches with neutral controls", () => {
    expect(swatchColors(defaultSettings().colors[0])).toEqual([
      "#46D9E8",
      "#477BFF",
      "#A477F5",
    ]);
  });
  it("restores bounded versioned local parameters without accepting invalid indices", () => {
    const value = restoreSettings({
      quality: "ultra",
      colors: [{ preset: 900, basePreset: -8, hue: NaN, accent: 500 }, null],
      camera: { distance: -100 },
      speed: "fast",
    });
    expect(value.colors[0]).toMatchObject({
      preset: 3,
      basePreset: 0,
      hue: 0,
      accent: 50,
    });
    expect(value.colors[1].preset).toBe(1);
    expect(value.camera.distance).toBe(7.5);
    expect(value.speed).toBe(0.65);
    expect(restoreSettings(null).compare).toBe(false);
  });
});
