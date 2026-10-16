export const KnowledgeExperiments = {
  K01: {
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
    sceneName: "晶石花园",
    label: "晶石彩度",
    min: 0,
    max: 0.14,
    step: 0.01,
    initial: 0.1,
    reference: 0.04,
    ends: ["灰一些", "鲜一些"],
    hint: "保持晶石的明度与色相，比较灰化与鲜艳。花园中的岩石和植物保持不变。",
    question: "彩度改变后，它与环境的关系有什么不同？",
  },
  K04: {
    sceneName: "湖畔山谷",
    label: "场景冷暖倾向",
    min: 0,
    max: 100,
    step: 1,
    initial: 75,
    reference: 20,
    ends: ["偏蓝的环境", "偏橙的环境"],
    hint: "同一构图从偏蓝经过灰调，逐渐转向偏橙，比较环境的变化。",
    question: "两种环境让你想起怎样的时间或天气？",
  },
  K05: {
    sceneName: "林间温室",
    label: "相邻色相的间距",
    min: 5,
    max: 35,
    step: 1,
    initial: 20,
    reference: 5,
    ends: ["更接近", "稍微展开"],
    hint: "围绕同一个主色，调整温室、树木与植物之间的相邻色相。各区域的明暗保持不变。",
    question: "哪一组颜色既有联系，又能分清前后层次？",
  },
  K06: {
    sceneName: "深海来客",
    label: "潜艇与环境的色相差",
    min: 0,
    max: 180,
    step: 1,
    initial: 140,
    reference: 20,
    ends: ["接近环境", "差异更明显"],
    hint: "固定蓝色环境和圆球大小，只改变潜艇与环境的色相差。",
    question: "你的目光什么时候开始停在潜艇上？",
  },
  K07: {
    sceneName: "双色艺廊",
    label: "画中珊瑚色面积",
    min: 0,
    max: 100,
    step: 1,
    initial: 35,
    reference: 20,
    ends: ["少一点", "多一点"],
    hint: "画框内始终使用同一对蓝色与珊瑚色，只改变画面中的面积占比。艺廊空间保持不变。",
    question: "什么时候，点缀色变成了主色？",
  },
} as const;
export type KnowledgeExperimentId = keyof typeof KnowledgeExperiments;
const lch = (lightness: number, chroma: number, hue: number) =>
  `oklch(${lightness} ${chroma} ${((hue % 360) + 360) % 360})`;
export function experimentPalette(id: KnowledgeExperimentId, value: number) {
  const colors = {
    sky: "#0a172b",
    far: "#29394e",
    near: "#1e2b40",
    ground: "#142437",
    arch: "#68778d",
    orb: lch(0.7, 0.1, 300),
  };
  if (id === "K03") colors.orb = lch(0.7, value, 300);
  if (id === "K04") {
    const hue = value <= 50 ? 250 : 50;
    const strength = Math.abs(value - 50) / 50;
    colors.sky = lch(0.27, 0.035 * strength, hue);
    colors.far = lch(0.47, 0.065 * strength, hue);
    colors.near = lch(0.37, 0.045 * strength, hue);
    colors.ground = lch(0.3, 0.035 * strength, hue);
    colors.arch = lch(0.62, 0.065 * strength, hue);
    colors.orb = lch(0.8, 0.1 * strength, hue);
  }
  if (id === "K05") {
    colors.sky = lch(0.25, 0.035, 200 - value);
    colors.far = lch(0.45, 0.06, 200 - value);
    colors.near = lch(0.38, 0.06, 200 + value);
    colors.ground = lch(0.3, 0.04, 200);
    colors.arch = lch(0.58, 0.05, 200 + value);
    colors.orb = lch(0.75, 0.1, 200);
  }
  if (id === "K06") {
    colors.sky = lch(0.25, 0.035, 250);
    colors.far = lch(0.45, 0.06, 250);
    colors.near = lch(0.38, 0.06, 250);
    colors.ground = lch(0.3, 0.04, 250);
    colors.arch = lch(0.58, 0.05, 250);
    colors.orb = lch(0.73, 0.12, 250 + value);
  }
  return colors;
}
export function experimentValue(id: KnowledgeExperimentId, value: number) {
  if (id === "K03") return value.toFixed(2);
  if (id === "K04")
    return value < 45 ? "偏冷" : value > 55 ? "偏暖" : "灰调过渡";
  if (id === "K05") return `±${value}°`;
  return `${value}${id === "K02" || id === "K07" ? "%" : "°"}`;
}
