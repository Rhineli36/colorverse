import { JELLYFISH_PATH, TREE_PATH, WEIGHT_PATH } from "./lab-navigation";
export const experiments = [
  {
    id: "jellyfish",
    number: "01",
    category: "粒子与色彩",
    description:
      "用同一只水母，观察不同配色如何改变视觉焦点、空间层次与情绪感受。",
    title: "深海水母",
    subtitle: "色彩的呼吸",
    cover: import.meta.env.BASE_URL + "color-lab/jellyfish-cover.webp",
    tags: ["类似色", "冷暖对比", "点缀色", "明暗层次"],
    path: JELLYFISH_PATH,
    load: () => import("./JellyfishLab"),
  },
  {
    id: "color-tree",
    number: "02",
    category: "色彩与环境",
    title: "色彩之树",
    subtitle: "一树四季 · 色彩的气候",
    description: "保持同一棵树，改变色彩，观察季节、空间与视觉感受的变化。",
    cover: import.meta.env.BASE_URL + "color-lab/tree-cover.webp",
    tags: ["整体色调", "冷暖关系", "同时对比", "色彩面积"],
    path: TREE_PATH,
    load: () => import("./TreeLab"),
  },
  {
    id: "color-weight",
    number: "03",
    category: "面积与视觉重心",
    title: "色彩的分量",
    subtitle: "一室一瓶，同色不同局",
    description:
      "固定四种颜色，展开窗帘，观察面积分布如何改变画面的主次与视觉重心。",
    cover: import.meta.env.BASE_URL + "color-lab/weight-cover.svg",
    tags: ["色彩面积", "主次关系", "冷暖倾向", "构图对照"],
    path: WEIGHT_PATH,
    load: () => import("./WeightLab"),
  },
];
