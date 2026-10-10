import { assertPlanetMove, type LayoutActor } from "@colorverse/domain";
import { MotionSchema, type PlanetMotion } from "@colorverse/contracts";
export interface PlanetMove {
  universeId: string;
  planetId: string;
  position: { x: number; y: number };
  expectedPosition: { x: number; y: number };
  expectedLayoutRevision: number;
}
export interface PlanetMotionChange {
  universeId: string;
  planetId: string;
  position: { x: number; y: number };
  motion: PlanetMotion;
  expectedLayoutRevision: number;
}
export interface UniverseLayoutRepository {
  getPlanetOwner(planetId: string): Promise<string | null>;
  movePlanet(move: PlanetMove, actor: LayoutActor): Promise<void>;
  configurePlanetMotion(
    change: PlanetMotionChange,
    actor: LayoutActor,
  ): Promise<void>;
}
export class UniverseLayoutService {
  constructor(private repository: UniverseLayoutRepository) {}
  async move(move: PlanetMove, actor: LayoutActor) {
    assertPlanetMove(
      actor,
      await this.repository.getPlanetOwner(move.planetId),
    );
    for (const p of [move.position, move.expectedPosition])
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
        throw new Error("星球位置必须是有限坐标。");
    await this.repository.movePlanet(move, actor);
  }
  async configureMotion(change: PlanetMotionChange, actor: LayoutActor) {
    assertPlanetMove(
      actor,
      await this.repository.getPlanetOwner(change.planetId),
    );
    const motion = MotionSchema.parse(change.motion);
    if (
      !Number.isFinite(change.position.x) ||
      !Number.isFinite(change.position.y)
    )
      throw new Error("星球位置必须是有限坐标。");
    await this.repository.configurePlanetMotion({ ...change, motion }, actor);
  }
}
