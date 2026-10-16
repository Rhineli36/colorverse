export const KnowledgeExperiments = {
  K01: {
    interactive: true,
    sceneName: "流动的色相",
    label: "画面色相偏移",
    min: 0,
    max: 360,
    step: 1,
    initial: 0,
    reference: 0,
    ends: ["原始配色", "旋转一周"],
    hint: "转动画面的色相，观察曲面、圆球与背景的颜色怎样一起变化。左图保留原始配色。",
    question: "同样的形状换一组颜色，会让你想到什么？",
  },
  K02: {
    interactive: true,
    sceneName: "阶梯上的光",
    label: "画面明暗",
    min: 40,
    max: 160,
    step: 1,
    initial: 100,
    reference: 100,
    ends: ["暗一些", "亮一些"],
    hint: "调整整幅图的亮度，比较阶梯、墙面与人物剪影的明暗关系。100% 为原图亮度。",
    question: "画面变亮或变暗后，你先注意到哪里？",
  },
  K03: {
    interactive: true,
    sceneName: "红衣与灰调",
    label: "画面饱和度",
    min: 0,
    max: 200,
    step: 1,
    initial: 100,
    reference: 100,
    ends: ["灰一些", "鲜一些"],
    hint: "调整整幅图的饱和度，观察红衣、红花与灰绿背景的关系。100% 为原图，0% 为灰度。",
    question: "颜色变淡之后，你的目光还会停在同一处吗？",
  },
  K04: {
    interactive: true,
    sceneName: "窗内与窗外",
    label: "画面冷暖倾向",
    min: -100,
    max: 100,
    step: 1,
    initial: 0,
    reference: 0,
    ends: ["偏冷", "偏暖"],
    hint: "在原图基础上调整整体冷暖倾向，比较室内灯光与窗外湖山的关系。中点保留原图。",
    question: "哪一种氛围让你更想在这里停留？",
  },
  K05: { interactive: false, sceneName: "绿意之间" },
  K06: { interactive: false, sceneName: "紫与金的交织" },
  K07: { interactive: false, sceneName: "一抹橙帆" },
} as const;
export type KnowledgeExperimentId = keyof typeof KnowledgeExperiments;
export function experimentValue(id: KnowledgeExperimentId, value: number) {
  if (id === "K04")
    return value === 0
      ? "原图"
      : `${value < 0 ? "偏冷" : "偏暖"} ${Math.abs(value)}%`;
  return `${value}${id === "K01" ? "°" : "%"}`;
}
