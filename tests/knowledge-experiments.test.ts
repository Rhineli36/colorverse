import { describe, expect, it } from "vitest";
import { knowledgeImageFilter } from "../apps/web/src/features/classroom/knowledge-example-images";
import {
  experimentPalette,
  KnowledgeExperiments,
  type KnowledgeExperimentId,
} from "../apps/web/src/features/classroom/knowledge-experiment-model";

const components = (color: string) => color.match(/[\d.]+/g)!.map(Number);

describe("knowledge experiments isolate the color relation being explored", () => {
  it("keeps supplied originals neutral and bounds the image controls", () => {
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
  });
  it("changes chroma independently while keeping the surrounding scene fixed", () => {
    for (const [id, changed] of [["K03", 1]] as const) {
      const spec = KnowledgeExperiments[id];
      const a = experimentPalette(id, spec.min);
      const b = experimentPalette(id, spec.max);
      const first = components(a.orb),
        last = components(b.orb);
      for (let i = 0; i < 3; i++) {
        if (i === changed) expect(first[i]).not.toBe(last[i]);
        else expect(first[i]).toBe(last[i]);
      }
      expect({ ...a, orb: "" }).toEqual({ ...b, orb: "" });
    }
  });
  it("expands neighboring hues and changes target contrast without changing their lightness or chroma", () => {
    for (const id of ["K05", "K06"] as KnowledgeExperimentId[]) {
      const spec = KnowledgeExperiments[id];
      const a = experimentPalette(id, spec.min),
        b = experimentPalette(id, spec.max);
      for (const key of Object.keys(a) as (keyof typeof a)[]) {
        expect(components(a[key]).slice(0, 2)).toEqual(
          components(b[key]).slice(0, 2),
        );
      }
      expect(a).not.toEqual(b);
      if (id === "K06") expect({ ...a, orb: "" }).toEqual({ ...b, orb: "" });
    }
  });
  it("passes smoothly through a neutral environment in the cold-to-warm comparison", () => {
    const a = experimentPalette("K04", 0),
      neutral = experimentPalette("K04", 50),
      b = experimentPalette("K04", 100);
    for (const key of Object.keys(a) as (keyof typeof a)[]) {
      const cold = components(a[key]),
        middle = components(neutral[key]),
        warm = components(b[key]);
      expect(cold[0]).toBe(warm[0]);
      expect(cold[1]).toBe(warm[1]);
      expect(middle[1]).toBe(0);
      expect(cold[2]).not.toBe(warm[2]);
    }
  });
});
