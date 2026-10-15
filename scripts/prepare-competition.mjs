import {
  exhibitionProfiles,
  exhibitionDescriptions,
} from "./exhibition-profiles.mjs";
import { nextGrowthPlacement, growthElementColor } from "@colorverse/domain";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { CloudPlanetDocumentSchema } from "@colorverse/contracts";
const destination = "apps/web/public/competition";
try {
  const sources = JSON.parse(
      await readFile("work/demo-materials/selected.json", "utf8"),
    ),
    journal = JSON.parse(await readFile("work/demo-accounts.json", "utf8")),
    reviews = JSON.parse(
      await readFile("work/demo-materials/reviews.json", "utf8"),
    );
  if (
    sources.length !== 5 ||
    journal.students.length !== 5 ||
    reviews.length !== 5
  )
    throw new Error("DEMO_MATERIALS_REQUIRED");
  const styles = [
    ["焰色失重", 0, "#efa568", "ring", "fireflies", "fast", "ellipse"],
    ["落日来信", 2, "#5a9dde", "soft", "stardust", "slow", "circle"],
    ["森野绮梦", 1, "#82c9ae", "soft", "fireflies", "slow", "drift"],
    ["云隙漫游", 3, "#b397d4", "ring", "stardust", "fast", "figure-eight"],
    ["月白棱镜", 5, "#c5bdaa", "none", "none", "stationary", "ellipse"],
  ];
  await mkdir(destination, { recursive: true });
  const students = [];
  let bytes = 0;
  for (const [i, source] of sources.entries()) {
    if (
      source.works.length !== 5 ||
      journal.students[i].works.length !== 5 ||
      reviews[i].length !== 5
    )
      throw new Error("FIVE_WORKS_REQUIRED");
    const works = [];
    for (const [j, work] of source.works.entries()) {
      const original = await readFile(work.file);
      if (createHash("sha256").update(original).digest("hex") !== work.sha256)
        throw new Error("SOURCE_IMAGE_CHANGED");
      const preview = await sharp(original, { limitInputPixels: 16000000 })
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
      const image = `student-${i + 1}-work-${j + 1}.webp`;
      await writeFile(`${destination}/${image}`, preview);
      bytes += preview.length;
      works.push({
        params: nextGrowthPlacement(
          works.map((w) => w.params),
          i + 1,
        ),
        id: `demo-${i + 1}-work-${j + 1}`,
        color: growthElementColor(
          ["#efa568", "#5a9dde", "#82c9ae", "#b397d4", "#c5bdaa"][i],
          j,
        ),
        title: work.title,
        description: exhibitionDescriptions[i][j],
        image,
        presetId: journal.students[i].works[j].presetId,
        score: reviews[i][j].score,
        comment: reviews[i][j].comment,
      });
    }
    const [, skin, color, halo, atmosphere, mode, trajectory] = styles[i];
    students.push({
      id: `demo-${i + 1}`,
      display_name: journal.students[i].displayName,
      exterior: `case-${i + 1}-exterior.webp`,
      interior: `case-${i + 1}-interior.webp`,
      style: [
        "红蓝图形·波普",
        "暖橙粉紫·水彩童话",
        "粉紫橄榄绿·手绘花园",
        "粉蓝淡紫·云端梦境",
        "紫绿白·几何纹样",
      ][i],
      document: CloudPlanetDocumentSchema.parse({
        metadata: { ...exhibitionProfiles[i], demoWriting: true },
        skin,
        color,
        halo,
        atmosphere,
        motion: {
          version: "1.0.0",
          mode,
          trajectory,
          range: "wide",
          direction: i % 2 ? "reverse" : "forward",
        },
      }),
      sent: [8, 8, 6, 6, 8][i],
      received: i === 3 ? 12 : 6,
      works,
    });
  }
  const defaults = styles.map(([, skin, color], i) => ({
    id: `default-${i + 1}`,
    display_name: "默认风格",
    document: CloudPlanetDocumentSchema.parse({
      metadata: {
        name: `默认 · ${["流焰星", "潮汐星", "翡翠星", "紫雾星", "月岩星"][i]}`,
      },
      skin,
      color,
      motion: {
        version: "1.0.0",
        mode: "stationary",
        trajectory: "circle",
        range: "compact",
        direction: "forward",
      },
    }),
    works: [],
  }));
  await writeFile(
    `${destination}/manifest.json`,
    JSON.stringify({ version: 1, students, defaults }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "competition_previews_ready",
      students: 5,
      works: 25,
      previewBytes: bytes,
      originalsModified: false,
      realIdentitiesIncluded: false,
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      status: "failed",
      code: /^[A-Z_]+$/.test(e.message)
        ? e.message
        : "COMPETITION_PREPARATION_FAILED",
    }),
  );
  process.exitCode = 1;
}
