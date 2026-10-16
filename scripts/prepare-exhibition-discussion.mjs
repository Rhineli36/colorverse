import { readFile, writeFile } from "node:fs/promises";
const file = "apps/web/public/competition/manifest.json",
  data = JSON.parse(await readFile(file, "utf8"));
const visits = [
  "这片红蓝很酷，来踩踩！下次带新作品来串门。",
  "被这片落日色留住了，想在这里多待一会儿。",
  "这座小花园好治愈，路过也能收获一点好心情。",
  "粉紫色像软软的云，宇宙散步打卡成功。",
  "月白和浅紫好干净，找到了一座安静的小展馆。",
];
for (const [i, p] of data.students.entries()) {
  const a = data.students[(i + 1) % 5],
    b = data.students[(i + 2) % 5];
  p.planetInteractions = [
    ...(p.planetInteractions ?? []).filter(
      (r) => r.kind !== "comment" && r.source !== "prepared",
    ),
    {
      kind: "comment",
      author: a.display_name,
      content: visits[i],
      source: "prepared",
    },
    {
      kind: "comment",
      author: b.display_name,
      content: "来拜访一下大神的星球～这里的配色很有自己的性格。",
      source: "prepared",
    },
    {
      kind: "comment",
      author: p.display_name,
      content: "欢迎串门！谢谢喜欢，有新作品的时候记得再来坐坐。",
      source: "prepared",
    },
  ];
  for (const w of p.works) {
    w.interactions = [
      ...(w.interactions ?? []).filter(
        (r) => r.kind !== "comment" && r.source !== "prepared",
      ),
      { kind: "like", author: b.display_name, content: "", source: "prepared" },
      {
        kind: "comment",
        author: a.display_name,
        content: "第一眼就被画面的色彩抓住了，主体和背景的关系很有意思。",
        source: "prepared",
      },
      {
        kind: "comment",
        author: b.display_name,
        content:
          "喜欢这件作品的氛围！想看看减少一点点亮色后，视觉焦点会不会更集中。",
        source: "prepared",
      },
      {
        kind: "comment",
        author: p.display_name,
        content: `谢谢建议！我会再看看「${w.title}」的颜色面积和明暗关系，之后带着新想法回来。`,
        source: "prepared",
      },
    ];
  }
}
await writeFile(file, JSON.stringify(data, null, 2) + "\n");
console.log(
  "Prepared distinct peer voices and author replies for five planets and 25 works. Original work images and grades preserved.",
);
