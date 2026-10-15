import {
  fixturePlanet,
  fixtureUniverse,
  demoSpecs,
  demoUniversePositions,
  uid,
} from "@colorverse/fixtures";
import type { AssetRecord } from "@colorverse/contracts";
import { sha256 } from "@colorverse/package-io";
import type { LocalWorkspace } from "../adapters/local/store";
import demoAssets from "./demo-assets.json";
export function demoBodyRecord(index: number): AssetRecord {
  const spec = demoAssets.bodies[index],
    assetId = uid(7000 + index);
  return {
    assetId,
    original: {
      path: `assets/${assetId}/original.webp`,
      sha256: spec.sha256,
      byteSize: spec.byteSize,
      mimeType: "image/webp",
      width: 512,
      height: 512,
    },
    variants: [
      {
        kind: "thumbnail",
        path: `assets/${assetId}/thumbnail.webp`,
        sha256: spec.thumbnail.sha256,
        byteSize: spec.thumbnail.byteSize,
        mimeType: "image/webp",
        width: 256,
        height: 256,
        recipeVersion: "demo-v2",
      },
    ],
    rights: {
      creator: "COLORVERSE 系统演示素材",
      license: "system-demo",
      source:
        "内置 imagegen 生成；docs/30-default-art-and-student-entry.md；非学生作品",
      consentToPublish: true,
    },
  };
}
async function fetchDemo(path: string) {
  const response = await fetch(`${import.meta.env.BASE_URL}demo/${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("演示素材加载失败");
  return response.blob();
}
async function loadNewBody(index: number) {
  const record = demoBodyRecord(index),
    files = new Map<string, Blob>();
  for (const [file, path] of [
    [record.original, `v2/body-${index}.webp`],
    [record.variants[0], `v2/body-${index}-thumb.webp`],
  ] as const) {
    const blob = await fetchDemo(path);
    if (
      blob.size !== file.byteSize ||
      (await sha256(new Uint8Array(await blob.arrayBuffer()))) !== file.sha256
    )
      throw new Error("默认星球素材校验失败，请刷新后重试");
    files.set(file.path, blob);
  }
  return { record, files };
}
/** A pristine template; never clone another student's current artwork. */
export async function loadDemoPlanet(index: number) {
  const planet = fixturePlanet(index),
    files = new Map<string, Blob>();
  const [, body] = await Promise.all([
    Promise.all(
      planet.assetRefs.map(async (record, a) => {
        const blob = await fetchDemo(
          `${a === 0 ? "body" : "room"}-${index}.png`,
        );
        record.original.sha256 = await sha256(
          new Uint8Array(await blob.arrayBuffer()),
        );
        record.original.byteSize = blob.size;
        files.set(record.original.path, blob);
      }),
    ),
    loadNewBody(index),
  ]);
  planet.assetRefs.push(body.record);
  const source = planet.exterior.scene.layers[0].source;
  if ("assetId" in source) source.assetId = body.record.assetId;
  for (const [path, blob] of body.files) files.set(path, blob);
  return { planet, files };
}
async function upgradeDemoArtwork(store: LocalWorkspace) {
  const planets = await store.list();
  for (let i = 0; i < demoSpecs.length; i++) {
    const old = fixturePlanet(i),
      current = planets.find((p) => p.planetId === old.planetId),
      body = current?.exterior.scene.layers.find((l) => l.kind === "image"),
      original = current?.assetRefs.find(
        (a) => a.assetId === old.assetRefs[0].assetId,
      );
    if (
      !body ||
      !("assetId" in body.source) ||
      body.source.assetId !== old.assetRefs[0].assetId ||
      original?.rights.license !== "system-demo" ||
      original.original.sha256 !== demoAssets.bodies[i].previousSha256
    )
      continue;
    const replacement = await loadNewBody(i);
    await store.upgradeDemoBody(
      old.planetId,
      old.assetRefs[0].assetId,
      demoAssets.bodies[i].previousSha256,
      replacement.record,
      replacement.files,
    );
  }
}
export async function bootstrap(store: LocalWorkspace) {
  const initializeSpatialDemo = async () => {
    await store.initializeDemoOwnership(
      demoSpecs.map((_, i) => fixturePlanet(i).planetId),
    );
    await store.migrateDemoLayout(
      demoSpecs.map((spec, i) => ({
        planetId: fixturePlanet(i).planetId,
        before: spec.position,
        after: demoUniversePositions[i],
      })),
    );
    await upgradeDemoArtwork(store);
  };
  try {
    await store.getUniverse();
    await initializeSpatialDemo();
    return;
  } catch (e) {
    if (!(e instanceof Error) || !("code" in e) || e.code !== "NOT_FOUND")
      throw e;
  }
  // Keep room for Auth requests on browsers with a small per-origin connection pool.
  const loaded: Awaited<ReturnType<typeof loadDemoPlanet>>[] = [];
  for (let i = 0; i < demoSpecs.length; i += 2)
    loaded.push(
      ...(await Promise.all(
        demoSpecs.slice(i, i + 2).map((_, j) => loadDemoPlanet(i + j)),
      )),
    );
  const planets = loaded.map((item) => item.planet),
    files = new Map<string, Blob>();
  for (const item of loaded)
    for (const [path, blob] of item.files) files.set(path, blob);
  await store.importAtomic(
    planets,
    fixtureUniverse(planets),
    files,
    "initial-demo-v1",
  );
  await initializeSpatialDemo();
}
