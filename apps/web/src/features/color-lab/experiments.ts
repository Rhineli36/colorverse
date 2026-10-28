import { JELLYFISH_PATH } from "./lab-navigation";
export const experiments = [
  {
    id: "jellyfish",
    number: "01",
    title: "深海水母",
    subtitle: "色彩的呼吸",
    cover: import.meta.env.BASE_URL + "color-lab/jellyfish-cover.webp",
    tags: ["类似色", "冷暖对比", "点缀色", "明暗层次"],
    path: JELLYFISH_PATH,
    load: () => import("./JellyfishLab"),
  },
];
