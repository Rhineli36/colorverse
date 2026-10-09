import { imageInfo, sha256 } from "@colorverse/package-io";
import type { AssetRecord } from "@colorverse/contracts";
export async function prepareImage(file: File, creator: string) {
  if (file.size > 20 * 1024 * 1024) throw new Error("每张原图不能超过 20 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    info = imageInfo(bytes),
    assetId = crypto.randomUUID(),
    ext = info.mimeType === "image/jpeg" ? "jpg" : info.mimeType.split("/")[1],
    path = `assets/${assetId}/original.${ext}`;
  const bitmap = await createImageBitmap(file);
  if (bitmap.width !== info.width || bitmap.height !== info.height) {
    bitmap.close();
    throw new Error("图片解码尺寸不一致");
  }
  const files = new Map<string, Blob>([[path, file]]),
    record: AssetRecord = {
      assetId,
      original: {
        ...info,
        path,
        sha256: await sha256(bytes),
        byteSize: file.size,
      },
      variants: [],
      rights: {
        creator,
        license: "student-original",
        source: file.name,
        consentToPublish: false,
      },
    };
  try {
    for (const [kind, max] of [
      ["thumbnail", 256],
      ["display", 2048],
    ] as const) {
      const scale = Math.min(1, max / Math.max(info.width, info.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(info.width * scale));
      canvas.height = Math.max(1, Math.round(info.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("无法生成展示图"))),
          "image/webp",
          0.9,
        ),
      );
      const variantPath = `assets/${assetId}/${kind}.webp`;
      record.variants.push({
        kind,
        path: variantPath,
        sha256: await sha256(new Uint8Array(await blob.arrayBuffer())),
        byteSize: blob.size,
        mimeType: blob.type as "image/webp",
        width: canvas.width,
        height: canvas.height,
        recipeVersion: "browser-v1",
      });
      files.set(variantPath, blob);
    }
  } finally {
    bitmap.close();
  }
  return { record, files };
}
export function inspectInWorker(file: File) {
  return new Promise<import("@colorverse/package-io").PackageReport>(
    (resolve, reject) => {
      const worker = new Worker(
        new URL("./package.worker.ts", import.meta.url),
        { type: "module" },
      );
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("包校验超时，请尝试较小作品包"));
      }, 30000);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        if (e.data.ok) resolve(e.data.report);
        else reject(new Error(e.data.message));
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(e.message));
      };
      file
        .arrayBuffer()
        .then((buffer) => worker.postMessage(buffer, [buffer]))
        .catch((e) => {
          clearTimeout(timer);
          worker.terminate();
          reject(e);
        });
    },
  );
}
