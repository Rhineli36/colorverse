import type { Layer, PlanetDocument } from "@colorverse/contracts";
import { assertPlanetMove, type LayoutActor } from "@colorverse/domain";
export interface GrowthElementRepository {
  getPlanetOwner(id: string): Promise<string | null>;
  updateElement(
    planetId: string,
    layer: Layer,
    revision: number,
    actor: LayoutActor,
  ): Promise<PlanetDocument>;
}
export class GrowthElementService {
  constructor(private repository: GrowthElementRepository) {}
  async save(
    planetId: string,
    layer: Layer,
    revision: number,
    actor: LayoutActor,
  ) {
    assertPlanetMove(actor, await this.repository.getPlanetOwner(planetId));
    return this.repository.updateElement(planetId, layer, revision, actor);
  }
}
