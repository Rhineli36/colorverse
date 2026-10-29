import { weightSvg, type WeightScene } from "./weight-scene";

export async function weightCanvas(scene: WeightScene, width = 1200) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((width * 750) / 1200);
  const image = new Image();
  const url = URL.createObjectURL(
    new Blob([weightSvg(scene)], { type: "image/svg+xml" }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error("静物画面加载失败"));
      image.src = url;
    });
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw Error("浏览器无法计算画面面积");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  } finally {
    URL.revokeObjectURL(url);
  }
}
const cache = new Map<string, number[]>();
export async function weightAreas(scene: WeightScene, width = 1200) {
  if (width !== 1200 && width !== 2400)
    throw Error("UNSUPPORTED_STATISTICS_SIZE");
  const key = JSON.stringify(scene) + ":" + width;
  const previous = cache.get(key);
  if (previous) return [...previous];
  const { canvas, ctx } = await weightCanvas(scene, width),
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = scene.palette.map((hex) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    ),
    counts = [0, 0, 0, 0];
  // All regions are opaque. Assign antialiased boundary pixels to the nearest palette RGB.
  for (let p = 0; p < pixels.length; p += 4) {
    let nearest = 0,
      distance = Infinity;
    for (let c = 0; c < 4; c++) {
      const rgb = colors[c];
      const d =
        (pixels[p] - rgb[0]) ** 2 +
        (pixels[p + 1] - rgb[1]) ** 2 +
        (pixels[p + 2] - rgb[2]) ** 2;
      if (d < distance) {
        nearest = c;
        distance = d;
      }
    }
    counts[nearest]++;
  }
  cache.set(key, counts);
  if (cache.size > 45) cache.delete(cache.keys().next().value!);
  return [...counts];
}
export async function weightPng(current: WeightScene, saved?: WeightScene) {
  const scenes = saved ? [saved, current] : [current],
    output = document.createElement("canvas");
  output.width = 1200 * scenes.length;
  output.height = 750;
  const ctx = output.getContext("2d")!;
  for (let i = 0; i < scenes.length; i++) {
    const { canvas } = await weightCanvas(scenes[i]);
    ctx.drawImage(canvas, i * 1200, 0);
  }
  return new Promise<Blob>((resolve, reject) =>
    output.toBlob((b) => (b ? resolve(b) : reject(Error("图片导出失败")))),
  );
}
