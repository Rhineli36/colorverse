import {
  fixturePlanet,
  fixtureUniverse,
  demoSpecs,
  demoUniversePositions,
} from "@colorverse/fixtures";
import { sha256 } from "@colorverse/package-io";
import type { LocalWorkspace } from "../adapters/local/store";
export async function bootstrap(store: LocalWorkspace) {
  const initializeSpatialDemo = async () => {
    for (let i = 0; i < demoSpecs.length; i++)
      await store.assignOwner(
        fixturePlanet(i).planetId,
        `demo-student-${i + 1}`,
      );
    await store.migrateDemoLayout(
      demoSpecs.map((spec, i) => ({
        planetId: fixturePlanet(i).planetId,
        before: spec.position,
        after: demoUniversePositions[i],
      })),
    );
  };
  try {
    await store.getUniverse();
    await initializeSpatialDemo();
    return;
  } catch (e) {
    if (!(e instanceof Error) || !("code" in e) || e.code !== "NOT_FOUND")
      throw e;
  }
  const planets = demoSpecs.map((_, i) => fixturePlanet(i)),
    files = new Map<string, Blob>();
  for (const [i, p] of planets.entries())
    for (const [a, record] of p.assetRefs.entries()) {
      const response = await fetch(
        `${import.meta.env.BASE_URL}demo/${a === 0 ? "body" : "room"}-${i}.png`,
      );
      if (!response.ok) throw new Error("演示素材加载失败");
      const blob = await response.blob();
      record.original.sha256 = await sha256(
        new Uint8Array(await blob.arrayBuffer()),
      );
      record.original.byteSize = blob.size;
      files.set(record.original.path, blob);
      if (a === 0) {
        const thumb = await (
            await fetch(`${import.meta.env.BASE_URL}demo/body-${i}-thumb.webp`)
          ).blob(),
          path = `assets/${record.assetId}/thumbnail.webp`;
        record.variants.push({
          kind: "thumbnail",
          path,
          sha256: await sha256(new Uint8Array(await thumb.arrayBuffer())),
          byteSize: thumb.size,
          mimeType: "image/webp",
          width: 256,
          height: 256,
          recipeVersion: "demo-v1",
        });
        files.set(path, thumb);
      }
    }
  await store.importAtomic(
    planets,
    fixtureUniverse(planets),
    files,
    "initial-demo-v1",
  );
  await initializeSpatialDemo();
}
