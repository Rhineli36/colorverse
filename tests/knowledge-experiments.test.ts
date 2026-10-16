import { describe, expect, it } from "vitest";
import {
  knowledgeImageFilter,
  temperatureMatrix,
  KnowledgeExampleImages,
} from "../apps/web/src/features/classroom/knowledge-example-images";
import { KnowledgeExperiments } from "../apps/web/src/features/classroom/knowledge-experiment-model";

describe("image-led color study", () => {
  it("provides controls only for hue, lightness, saturation and temperature", () => {
    const interactive = Object.entries(KnowledgeExperiments)
      .filter(([, topic]) => topic.interactive)
      .map(([id]) => id);
    expect(interactive).toEqual(["K01", "K02", "K03", "K04"]);
    for (const id of ["K05", "K06", "K07"])
      expect(knowledgeImageFilter(id, 200)).toBe("none");
  });
  it("keeps originals neutral, hue cyclic, and lightness and saturation bounded", () => {
    expect(
      knowledgeImageFilter("K01", KnowledgeExperiments.K01.reference),
    ).toBe("hue-rotate(0deg)");
    expect(knowledgeImageFilter("K01", 360)).toBe(
      knowledgeImageFilter("K01", 0),
    );
    expect(knowledgeImageFilter("K01", 180)).not.toBe(
      knowledgeImageFilter("K01", 0),
    );
    expect(
      knowledgeImageFilter("K02", KnowledgeExperiments.K02.reference),
    ).toBe("brightness(1)");
    expect(knowledgeImageFilter("K02", -100)).toBe("brightness(0.4)");
    expect(knowledgeImageFilter("K02", 1000)).toBe("brightness(1.6)");
    expect(
      knowledgeImageFilter("K03", KnowledgeExperiments.K03.reference),
    ).toBe("saturate(1)");
    expect(knowledgeImageFilter("K03", -100)).toBe("saturate(0)");
    expect(knowledgeImageFilter("K03", 1000)).toBe("saturate(2)");
  });
  it("shifts temperature smoothly through the untouched original without altering opacity", () => {
    expect(temperatureMatrix(0)).toEqual([
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -0, 0, 0, 0, 1, 0,
    ]);
    const pixel = [0.4, 0.4, 0.4, 1];
    const transform = (value: number) => {
      const m = temperatureMatrix(value);
      return [0, 1, 2, 3].map((row) =>
        pixel.reduce((sum, c, i) => sum + c * m[row * 5 + i], m[row * 5 + 4]),
      );
    };
    const cold = transform(-100),
      neutral = transform(0),
      warm = transform(100);
    expect(cold[0]).toBeLessThan(neutral[0]);
    expect(warm[0]).toBeGreaterThan(neutral[0]);
    expect(cold[2]).toBeGreaterThan(neutral[2]);
    expect(warm[2]).toBeLessThan(neutral[2]);
    for (const t of [-100, 0, 100]) expect(transform(t)[3]).toBe(1);
    expect(temperatureMatrix(-1000)).toEqual(temperatureMatrix(-100));
    expect(temperatureMatrix(1000)).toEqual(temperatureMatrix(100));
  });
  it("maps each supplied scene to distinct imagery and concrete observation prompts", () => {
    const images = Object.entries(KnowledgeExampleImages);
    expect(new Set(images.map(([, v]) => v.file)).size).toBe(7);
    for (const [, image] of images) {
      expect(image.observation.length).toBeGreaterThan(20);
      expect(image.analysis.length).toBeGreaterThan(40);
      expect(image.prompt.length).toBeGreaterThan(20);
    }
  });
});
