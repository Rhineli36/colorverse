import { Container, Graphics, BlurFilter } from "pixi.js";
import type { EffectParams, SceneDocument } from "@colorverse/contracts";
import {
  isParticle,
  particlePlan,
  particlePosition,
  satellitePosition,
  seededRandom,
} from "@colorverse/domain";

/** Owns no ticker: the scene renderer controls time, pause and resource lifetime. */
export function renderEffect(
  node: Container,
  id: string,
  p: EffectParams,
  scene: SceneDocument,
  lowQuality: boolean,
  count: number,
): ((seconds: number) => void) | undefined {
  const g = new Graphics();
  node.addChild(g);
  const alpha = p.opacity * p.intensity;
  const blur = (strength: number) => {
    if (!lowQuality) g.filters = [new BlurFilter({ strength, quality: 2 })];
  };
  if (id === "satellite") {
    const radius = p.orbitRadiusPx ?? 340,
      tilt = p.orbitTilt ?? 0.5,
      size = p.satelliteRadiusPx ?? 24;
    g.ellipse(0, 0, radius, radius * tilt).stroke({
      color: p.color,
      alpha: alpha * 0.18,
      width: 1,
    });
    const moons = Array.from({ length: p.satelliteCount ?? 1 }, () => {
      const moon = new Graphics()
        .circle(0, 0, size)
        .fill(p.color)
        .ellipse(size * 0.28, size * 0.1, size * 0.65, size * 0.85)
        .fill({ color: "#0B1120", alpha: 0.32 })
        .circle(-size * 0.25, -size * 0.3, size * 0.22)
        .fill({ color: "#FFFFFF", alpha: 0.35 * p.intensity })
        .circle(size * 0.25, size * 0.25, size * 0.14)
        .fill({ color: "#0B1120", alpha: 0.25 });
      node.addChild(moon);
      return moon;
    });
    const update = (seconds: number) =>
      moons.forEach((moon, i) => {
        const position = satellitePosition(p, i, seconds);
        moon.position.set(position.x, position.y);
        moon.alpha =
          p.opacity * (0.55 + p.intensity * 0.45) * (position.y < 0 ? 0.7 : 1);
        moon.scale.set(position.y < 0 ? 0.88 : 1);
      });
    update(0);
    return update;
  }
  if (id === "ring") {
    for (let i = 0; i < 3; i++)
      g.ellipse(0, 0, 300 + i * 9, 90 + i * 3).stroke({
        color: p.color,
        alpha: alpha * (1 - i * 0.24),
        width: 1 + p.intensity * 4,
      });
    return;
  }
  if (id === "halo") {
    for (let i = 0; i < 5; i++)
      g.circle(0, 0, 269 + i * 9).stroke({
        color: p.color,
        alpha: alpha * 0.85 * (1 - i / 5),
        width: 5 + p.intensity * 5,
      });
    blur(6);
    return;
  }
  if (id === "rim-light") {
    g.arc(0, 0, 248, Math.PI * 0.88, Math.PI * 1.85).stroke({
      color: p.color,
      alpha,
      width: 3 + p.intensity * 10,
    });
    g.arc(0, 0, 238, Math.PI * 0.96, Math.PI * 1.7).stroke({
      color: "#FFFFFF",
      alpha: alpha * 0.3,
      width: 2,
    });
    blur(5);
    return;
  }
  if (["soft-glow", "outer-glow", "breathe"].includes(id)) {
    // Draw beyond the body silhouette so background glows survive planet occlusion.
    for (let i = 0; i < 6; i++) {
      if (id === "outer-glow")
        g.circle(0, 0, 260 + i * 12).stroke({
          color: p.color,
          alpha: alpha * (0.5 - i * 0.07),
          width: 16,
        });
      else
        g.circle(0, 0, 245 + i * 16).fill({
          color: p.color,
          alpha: alpha * (0.09 - i * 0.012),
        });
    }
    blur(id === "outer-glow" ? 14 : 35);
    if (id === "breathe")
      return (seconds) => {
        g.alpha = 0.65 + 0.35 * Math.cos(seconds * p.speed * 2.5);
      };
    return;
  }
  if (id === "light-beam") {
    g.poly([
      -40,
      -scene.height / 2,
      40,
      -scene.height / 2,
      130,
      scene.height / 2,
      -130,
      scene.height / 2,
    ]).fill({ color: p.color, alpha: alpha * 0.18 });
    blur(20);
    return;
  }
  if (id === "fog") {
    const random = seededRandom(p.seed);
    for (let i = 0; i < 8; i++)
      g.ellipse(
        (random() - 0.5) * scene.width,
        (random() - 0.5) * scene.height,
        180,
        40,
      ).fill({ color: p.color, alpha: alpha * 0.1 });
    blur(30);
    return (seconds) => {
      g.x = Math.sin(seconds * p.speed * 0.12) * 18;
    };
  }
  if (isParticle(id)) {
    const particles = particlePlan(p.seed, count, scene.width, scene.height);
    const update = (seconds: number) => {
      g.clear();
      for (const particle of particles) {
        const position = particlePosition(
          particle,
          id,
          seconds,
          p.speed,
          scene.height,
        );
        const a =
          alpha *
          (0.5 +
            0.35 *
              Math.cos(seconds * p.speed * particle.drift + particle.phase));
        if (id === "rain")
          g.moveTo(position.x, position.y)
            .lineTo(position.x - 3, position.y + 18)
            .stroke({ color: p.color, alpha: a, width: 1 });
        else {
          const r =
            particle.radius *
            (id === "floating-lights" ? 4 : id === "fireflies" ? 2.6 : 1.8);
          if (id === "fireflies" || id === "floating-lights")
            g.circle(position.x, position.y, r * 2.4).fill({
              color: p.color,
              alpha: a * 0.25,
            });
          g.circle(position.x, position.y, r).fill({
            color: p.color,
            alpha: a,
          });
        }
      }
    };
    update(0);
    return update;
  }
}
