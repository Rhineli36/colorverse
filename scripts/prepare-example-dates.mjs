import { readFile, writeFile } from "node:fs/promises";
import {
  exampleWorkDate,
  planetGuestbook,
} from "./exhibition-presentation-data.mjs";
const file = "apps/web/public/competition/manifest.json",
  snapshot = JSON.parse(await readFile(file, "utf8"));
const j = JSON.parse(await readFile("work/demo-accounts.json", "utf8"));
if (j.marker !== "colorverse-class-demo-2026-10-14" || j.students.length !== 5)
  throw Error("MANAGED_DEMO_REQUIRED");
const dates = {};
for (const [i, s] of snapshot.students.entries()) {
  let comment = 0;
  s.planetInteractions = s.planetInteractions?.map((r) =>
    r.kind === "comment"
      ? {
          ...r,
          content: planetGuestbook[i][comment++ % planetGuestbook[i].length],
        }
      : r,
  );
  for (const [k, w] of s.works.entries()) {
    w.exampleDate = exampleWorkDate(i, k);
    dates[j.students[i].works[k].id] = w.exampleDate;
  }
}
await writeFile(file, JSON.stringify(snapshot, null, 2) + "\n");
await writeFile(
  "apps/web/public/competition/example-work-dates.json",
  JSON.stringify(dates, null, 2) + "\n",
);
console.log(
  "Prepared dates for 25 known example works; original submission timestamps were not changed.",
);
