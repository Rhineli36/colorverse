import type {
  ImageCrop,
  Layer,
  Transform,
  SceneDocument,
} from "@colorverse/contracts";
// The exterior frame belongs to the scene, never to an image's transform.
export function planetFrame(scene: Pick<SceneDocument, "width" | "height">) {
  return {
    x: scene.width / 2,
    y: scene.height / 2,
    diameter: (Math.min(scene.width, scene.height) * 4) / 9,
  };
}
export function visibleImageOpacity(opacity: number, exterior: boolean) {
  return Math.min(1, Math.max(exterior ? 0.5 : 0, opacity));
}
export function planetAnchorTransform(
  scene: SceneDocument,
  body: Layer,
  imageWidth: number,
): Transform {
  const frame = planetFrame(scene);
  return {
    ...body.transform,
    x: frame.x,
    y: frame.y,
    scaleX: frame.diameter / imageWidth,
    scaleY: frame.diameter / imageWidth,
    rotationDeg: 0,
  };
}
export function fitImage(
  layer: Layer,
  width: number,
  height: number,
  scene: SceneDocument,
  exterior: boolean,
): Transform {
  const frame = planetFrame(scene);
  const body =
    exterior && scene.layers.find((l) => l.kind === "image")?.id === layer.id;
  // Body textures cover a square before circular clipping; other images retain
  // their original proportions and optional crop coordinate system.
  const bounds = body
    ? {
        left: -layer.transform.anchorX * width,
        top: -layer.transform.anchorY * width,
        width,
        height: width,
      }
    : imageBounds(layer, width, height);
  const scale = Math.min(
    10,
    Math.max(
      0.01,
      exterior
        ? Math.max(
            frame.diameter / bounds.width,
            frame.diameter / bounds.height,
          )
        : Math.min(scene.width / bounds.width, scene.height / bounds.height),
    ),
  );
  return {
    ...layer.transform,
    x: scene.width / 2 - (bounds.left + bounds.width / 2) * scale,
    y: scene.height / 2 - (bounds.top + bounds.height / 2) * scale,
    scaleX: scale,
    scaleY: scale,
    rotationDeg: 0,
  };
}
export const fullImageCrop = (): ImageCrop => ({
  x: 0,
  y: 0,
  width: 1,
  height: 1,
});
export function imageBounds(layer: Layer, width: number, height: number) {
  const crop =
    "assetId" in layer.source
      ? (layer.source.crop ?? fullImageCrop())
      : fullImageCrop();
  return {
    left: (crop.x - layer.transform.anchorX) * width,
    top: (crop.y - layer.transform.anchorY) * height,
    width: crop.width * width,
    height: crop.height * height,
  };
}
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export function scaleImage(t: Transform, factor: number): Transform {
  const bounded = clamp(
    factor,
    Math.max(0.01 / t.scaleX, 0.01 / t.scaleY),
    Math.min(10 / t.scaleX, 10 / t.scaleY),
  );
  return {
    ...t,
    scaleX: clamp(t.scaleX * bounded, 0.01, 10),
    scaleY: clamp(t.scaleY * bounded, 0.01, 10),
  };
}
export function resizeImage(
  t: Transform,
  bounds: ReturnType<typeof imageBounds>,
  dx: number,
  dy: number,
  axis: "x" | "y" | "both",
  proportional: boolean,
): Transform {
  const r = (t.rotationDeg * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  const lx = dx * c + dy * s,
    ly = -dx * s + dy * c;
  let scaleX = t.scaleX,
    scaleY = t.scaleY;
  if (axis === "both" && proportional) {
    const vx = bounds.width * t.scaleX,
      vy = bounds.height * t.scaleY;
    const factor = 1 + (lx * vx + ly * vy) / (vx * vx + vy * vy);
    ({ scaleX, scaleY } = scaleImage(t, factor));
  } else {
    if (axis !== "y") scaleX = clamp(t.scaleX + lx / bounds.width, 0.01, 10);
    if (axis !== "x") scaleY = clamp(t.scaleY + ly / bounds.height, 0.01, 10);
  }
  const shiftX = -bounds.left * (scaleX - t.scaleX),
    shiftY = -bounds.top * (scaleY - t.scaleY);
  return {
    ...t,
    scaleX,
    scaleY,
    x: clamp(t.x + shiftX * c - shiftY * s, -16000, 16000),
    y: clamp(t.y + shiftX * s + shiftY * c, -16000, 16000),
  };
}
