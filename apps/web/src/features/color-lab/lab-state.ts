export const LAB_STORAGE_KEY = "colorverse.color-lab.jellyfish.v1";
export const PRESETS = [
  {
    name: "深海幽蓝",
    concept: "类似色 · 统一与变化",
    colors: ["#46D9E8", "#477BFF", "#A477F5"],
    question: "相邻色相如何共同塑造体积？",
    note: "青、蓝、紫相邻的色相建立统一感。观察伞体边缘、内部与口腕如何在统一中形成层次，也可以描述你自己的感受。",
  },
  {
    name: "冷暖共舞",
    concept: "互补色 · 对比与张力",
    colors: ["#287DDE", "#FF963F", "#589FE8"],
    question: "暖色出现后，目光首先停在哪里？",
    note: "蓝色主体与橙色口腕形成冷暖对比。保持曝光、辉光与姿态一致，比较色彩的视觉权重，而不预设每个人都会有相同的情绪感受。",
  },
  {
    name: "暗海微光",
    concept: "点缀色 · 面积与焦点",
    colors: ["#637E91", "#B8C9D4", "#FFD65A"],
    question: "增加亮黄色面积，焦点如何变化？",
    note: "灰蓝是基调，亮黄形成焦点。面积滑杆改变采用点缀色的粒子比例，粒子总数、位置与形态不变；比例不是人眼感知面积的精确测量。",
  },
  {
    name: "明暗观察",
    concept: "灰度 · 轮廓与体积",
    colors: ["#5C5C5C", "#A8A8A8", "#DEDEDE"],
    question: "转为灰度后，轮廓与层次还清楚吗？",
    note: "将该侧当前彩色方案按线性 RGB 亮度映射为灰度，保留微调。再次点击明暗观察可返回彩色，或选择另一配色。A、B 两侧分别记住原配色。",
  },
] as const;
export type Quality = "low" | "medium" | "high";
export type ColorState = {
  preset: number;
  basePreset: number;
  hue: number;
  saturation: number;
  brightness: number;
  accent: number;
};
export type LabCamera = { yaw: number; pitch: number; distance: number };
export type LabSettings = {
  paused: boolean;
  speed: number;
  glow: number;
  quality: Quality;
  compare: boolean;
  activeSide: 0 | 1;
  colors: [ColorState, ColorState];
  camera: LabCamera;
};
export function defaultSettings(): LabSettings {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const memory = (nav as (Navigator & { deviceMemory?: number }) | undefined)
    ?.deviceMemory;
  return {
    paused: false,
    speed: 0.65,
    glow: 0.35,
    quality:
      (memory && memory <= 4) ||
      (nav?.hardwareConcurrency && nav.hardwareConcurrency <= 4)
        ? "low"
        : "medium",
    compare: false,
    activeSide: 0,
    colors: [colorState(0), colorState(1)],
    camera: { yaw: 0.39, pitch: 0.09, distance: 10.5 },
  };
}
export function colorState(preset: number): ColorState {
  return {
    preset,
    basePreset: Math.min(2, preset),
    hue: 0,
    saturation: 100,
    brightness: 100,
    accent: 8,
  };
}
export function choosePreset(color: ColorState, preset: number): ColorState {
  if (preset === 3 && color.preset === 3)
    return { ...color, preset: color.basePreset };
  return {
    ...color,
    preset,
    basePreset: preset === 3 ? color.basePreset : preset,
  };
}
const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
export function restoreSettings(raw: unknown): LabSettings {
  const d = defaultSettings();
  if (!raw || typeof raw !== "object") return d;
  const v = raw as Partial<LabSettings>;
  return {
    paused: v.paused === true,
    compare: v.compare === true,
    activeSide: v.activeSide === 1 ? 1 : 0,
    speed: finite(v.speed, d.speed, 0, 1.5),
    glow: finite(v.glow, d.glow, 0, 1),
    quality: ["low", "medium", "high"].includes(v.quality ?? "")
      ? v.quality!
      : d.quality,
    colors: [0, 1].map((side) => {
      const c = v.colors?.[side];
      return {
        preset: Math.round(finite(c?.preset, side, 0, 3)),
        basePreset: Math.round(finite(c?.basePreset, side, 0, 2)),
        hue: finite(c?.hue, 0, -180, 180),
        saturation: finite(c?.saturation, 100, 0, 150),
        brightness: finite(c?.brightness, 100, 30, 170),
        accent: finite(c?.accent, 8, 0, 50),
      };
    }) as [ColorState, ColorState],
    camera: {
      yaw: finite(v.camera?.yaw, d.camera.yaw, -10000, 10000),
      pitch: finite(v.camera?.pitch, d.camera.pitch, -0.7, 0.8),
      distance: finite(v.camera?.distance, d.camera.distance, 7.5, 20),
    },
  };
}
export function loadSettings(): LabSettings {
  try {
    return restoreSettings(
      JSON.parse(localStorage.getItem(LAB_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return defaultSettings();
  }
}
export function saveSettings(value: LabSettings) {
  try {
    localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Storage may be disabled; the live experiment still works. */
  }
}
// Pure swatches mirror shader hue/saturation/brightness and linear luminance, without glow.
export function swatchColors(c: ColorState): string[] {
  return PRESETS[c.basePreset].colors.map((hex) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const a = (c.hue * Math.PI) / 180,
      co = Math.cos(a),
      si = Math.sin(a),
      k = 1 / Math.sqrt(3),
      mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
    const shifted = rgb.map((v, i) =>
      Math.max(
        0,
        v * co +
          (rgb[(i + 2) % 3] - rgb[(i + 1) % 3]) * k * si +
          mean * (1 - co),
      ),
    );
    const lum = shifted[0] * 0.2126 + shifted[1] * 0.7152 + shifted[2] * 0.0722;
    const sat = shifted.map((v) =>
      Math.max(0, lum + ((v - lum) * c.saturation) / 100),
    );
    const gray = sat[0] * 0.2126 + sat[1] * 0.7152 + sat[2] * 0.0722;
    return (
      "#" +
      sat
        .map((v) => ((c.preset === 3 ? gray : v) * c.brightness) / 100)
        .map((v) =>
          Math.round(
            Math.min(
              1,
              Math.max(
                0,
                v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055,
              ),
            ) * 255,
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
        .toUpperCase()
    );
  });
}
