import { describe, it, expect } from "vitest";
import { EffectParamsSchema, LayerSchema } from "@colorverse/contracts";
import { fixturePlanet } from "@colorverse/fixtures";
import {
  DecorationGroups,
  NewDecorationIds,
  createDecoration,
  composeDecorationTransform,
  particleCounts,
  particlePlan,
  particlePosition,
  satellitePosition,
  validatePlanet,
} from "@colorverse/domain";
const make = (id: Parameters<typeof createDecoration>[0], index = 1) =>
  createDecoration(
    id,
    fixturePlanet(0).exterior.scene,
    "#AADDFF",
    `12345678-1234-4123-8123-${index.toString().padStart(12, "0")}`,
    123,
  );
describe("optional planet decorations", () => {
  it("registers valid independent layers and aligns to the original body", () => {
    const planet = fixturePlanet(0),
      body = planet.exterior.scene.layers[0];
    const originals = structuredClone(planet.assetRefs);
    for (const [i, id] of DecorationGroups.flatMap((g) => g.ids).entries()) {
      const layer = make(id, i + 1);
      expect(LayerSchema.parse(layer)).toEqual(layer);
      expect(
        composeDecorationTransform(layer.transform, body.transform).x,
      ).toBe(body.transform.x);
      expect(
        composeDecorationTransform(layer.transform, body.transform).scaleX,
      ).toBe(body.transform.scaleX);
      planet.exterior.scene.layers.push(layer);
    }
    planet.requiredCapabilities.push("effects@1", "decorations@1");
    expect(validatePlanet(planet).assetRefs).toEqual(originals);
  });
  it("requires the new capability but still opens existing effects", () => {
    const planet = fixturePlanet(0);
    planet.exterior.scene.layers.push(make("ring"));
    if ("effectId" in planet.exterior.scene.layers[1].source)
      delete planet.exterior.scene.layers[1].source.anchorLayerId;
    expect(() => validatePlanet(planet)).not.toThrow();
    for (const id of NewDecorationIds) {
      planet.exterior.scene.layers[1] = make(id);
      expect(() => validatePlanet(planet)).toThrow("decorations@1");
    }
    planet.requiredCapabilities.push("decorations@1");
    expect(() => validatePlanet(planet)).not.toThrow();
  });
  it("composes attachment offsets with body movement, rotation and scale", () => {
    const local = make("ring").transform;
    const parent = {
      ...local,
      x: 600,
      y: 400,
      scaleX: 2,
      scaleY: 3,
      rotationDeg: 90,
    };
    const result = composeDecorationTransform(
      { ...local, x: 10, y: 20 },
      parent,
    );
    expect(result.x).toBeCloseTo(540);
    expect(result.y).toBeCloseTo(420);
    expect(result.scaleX).toBe(2);
    expect(result.rotationDeg).toBe(90);
    expect(composeDecorationTransform(local, { ...parent, y: 410 }).y).toBe(
      410,
    );
  });
  it("rejects missing, cross-scene and non-image attachment references", () => {
    const planet = fixturePlanet(0);
    planet.requiredCapabilities.push("decorations@1");
    const layer = make("ring");
    planet.exterior.scene.layers.push(layer);
    if (!("effectId" in layer.source)) throw new Error("effect expected");
    layer.source.anchorLayerId = layer.id;
    expect(() => validatePlanet(planet)).toThrow("同场景");
    layer.source.anchorLayerId = planet.interior.id;
    expect(() => validatePlanet(planet)).toThrow("同场景");
    layer.source.anchorLayerId = planet.exterior.scene.layers[0].id;
    expect(() => validatePlanet(planet)).not.toThrow();
  });
  it("rejects unbounded or fractional satellite parameters", () => {
    const source = make("satellite").source;
    if (!("effectId" in source)) throw new Error("effect expected");
    for (const invalid of [
      { satelliteCount: 4 },
      { satelliteCount: 1.5 },
      { orbitRadiusPx: 601 },
      { satelliteRadiusPx: 3 },
      { orbitTilt: 0.1 },
    ]) {
      expect(
        EffectParamsSchema.safeParse({ ...source.params, ...invalid }).success,
      ).toBe(false);
    }
  });
  it("keeps satellite orbits deterministic, bounded and still at zero speed", () => {
    const source = make("satellite").source;
    if (!("effectId" in source)) throw new Error("effect expected");
    const params = {
      ...source.params,
      satelliteCount: 3,
      orbitRadiusPx: 420,
      orbitTilt: 0.6,
    };
    const initial = satellitePosition(params, 0, 0);
    expect(satellitePosition(params, 0, 10)).not.toEqual(initial);
    expect(satellitePosition(params, 1, 0)).not.toEqual(initial);
    for (let t = 0; t < 100; t++) {
      const pos = satellitePosition(params, 2, t);
      expect((pos.x / 420) ** 2 + (pos.y / 252) ** 2).toBeCloseTo(1);
    }
    expect(satellitePosition({ ...params, speed: 0 }, 0, 100)).toEqual(
      satellitePosition({ ...params, speed: 0 }, 0, 0),
    );
  });
  it("shares an exact particle budget and ignores hidden layers", () => {
    const layers = Array.from({ length: 50 }, (_, i) =>
      make("stardust", i + 1),
    );
    layers[0].visible = false;
    const counts = particleCounts(layers, 300, 50);
    expect(counts.has(layers[0].id)).toBe(false);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      300,
    );
    const source = layers[1].source;
    if ("effectId" in source) source.params.density = 0;
    expect(particleCounts(layers, 1000).get(layers[1].id)).toBe(0);
  });
  it("uses seeded independent particles, zero-speed stillness and bounded weather", () => {
    const particles = particlePlan(12, 50, 1600, 900);
    expect(particlePlan(12, 50, 1600, 900)).toEqual(particles);
    expect(particlePlan(13, 50, 1600, 900)).not.toEqual(particles);
    expect(particlePosition(particles[0], "stardust", 60, 0, 900)).toEqual(
      particlePosition(particles[0], "stardust", 0, 0, 900),
    );
    expect(
      particlePosition(particles[0], "fireflies", 30, 0.4, 900),
    ).not.toEqual(particlePosition(particles[0], "fireflies", 0, 0.4, 900));
    for (const particle of particles)
      for (const id of ["rain", "snow"]) {
        const pos = particlePosition(particle, id, 100000, 2, 900);
        expect(pos.y).toBeGreaterThanOrEqual(-450);
        expect(pos.y).toBeLessThan(450);
      }
  });
});
