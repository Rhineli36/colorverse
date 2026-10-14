import type { PlanetMotion } from "@colorverse/contracts";
import { planetOrbit } from "./universe";

/** Stable automatic arrangement, separate from the editable local universe layout. */
export function cloudUniverseLayout(
  planets: { id: string; motion: PlanetMotion }[],
) {
  const sorted = [...planets].sort((a, b) => a.id.localeCompare(b.id));
  const columns = Math.max(1, Math.min(3, sorted.length));
  const rows = Math.max(1, Math.ceil(sorted.length / columns));
  return {
    width: columns * 1000,
    height: rows * 1000,
    entries: sorted.map((planet, index) => {
      const anchor = {
        x: 500 + (index % columns) * 1000,
        y: 500 + Math.floor(index / columns) * 1000,
      };
      return {
        id: planet.id,
        anchor,
        orbit: planetOrbit(
          {
            planetId: planet.id,
            position: anchor,
            scale: 1,
            motion: planet.motion,
          },
          7301944,
        ),
      };
    }),
  };
}
