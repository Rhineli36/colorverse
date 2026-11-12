import {
  BytesPerMiB,
  ClassroomImageLimitMb,
  LegacyClassroomImageLimitMb,
} from "@colorverse/contracts";

export const imageUploadLimitMb =
  import.meta.env.VITE_CLASSROOM_NEXT === "true"
    ? ClassroomImageLimitMb
    : LegacyClassroomImageLimitMb;
export const imageUploadLimitBytes = imageUploadLimitMb * BytesPerMiB;

export async function validateWorkImages(files: File[]) {
  if (files.length > 6) throw Error("每次最多提交六张作品图片。");
  if (files.reduce((sum, file) => sum + file.size, 0) > imageUploadLimitBytes)
    throw Error(`本次作品图片合计最多 ${imageUploadLimitMb} MB。`);
  for (const file of files) {
    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
      (b, i) => header[i] === b,
    );
    const jpeg = header[0] === 255 && header[1] === 216;
    const webp =
      new TextDecoder().decode(header.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(header.slice(8, 12)) === "WEBP";
    if (!png && !jpeg && !webp)
      throw Error(
        `「${file.name}」不是支持的 PNG、JPG 或 WebP 图片。HEIC/HEIF、TIFF 或 PDF 请先导出为 PNG/JPG，再选择上传；直接改文件后缀无效。`,
      );
    if (png && header.length >= 24) {
      const view = new DataView(header.buffer);
      if (view.getUint32(16) * view.getUint32(20) > 16000000)
        throw Error(
          `「${file.name}」超过 1600 万像素，请缩小图片尺寸后再提交。`,
        );
    }
  }
}
