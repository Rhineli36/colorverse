import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import {
  PlanetSchema,
  UniverseSchema,
  GrowthSchemaBase,
} from "@colorverse/contracts";
mkdirSync("docs/schemas/generated", { recursive: true });
for (const [name, schema] of Object.entries({
  planet: PlanetSchema,
  universe: UniverseSchema,
  growth: GrowthSchemaBase,
})) {
  writeFileSync(
    `docs/schemas/generated/${name}.schema.json`,
    JSON.stringify(z.toJSONSchema(schema), null, 2) + "\n",
  );
}
console.log(
  "Generated structural schemas; domain cross-reference and growth state checks remain mandatory.",
);
