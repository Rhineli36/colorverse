import { DomainError } from "@colorverse/domain";
export function imageInfo(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0,
    mimeType: "image/png" | "image/jpeg" | "image/webp";
  if (
    bytes.length >= 24 &&
    bytes
      .slice(0, 8)
      .every((b, i) => b === [137, 80, 78, 71, 13, 10, 26, 10][i])
  ) {
    mimeType = "image/png";
    width = v.getUint32(16);
    height = v.getUint32(20);
    let pos = 8;
    while (pos + 12 <= bytes.length) {
      const length = v.getUint32(pos),
        type = new TextDecoder().decode(bytes.slice(pos + 4, pos + 8));
      if (type === "acTL")
        throw new DomainError("VALIDATION_FAILED", "暂不支持动态 PNG");
      pos += length + 12;
    }
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    mimeType = "image/jpeg";
    let p = 2;
    while (p + 4 < bytes.length) {
      if (bytes[p] !== 255) {
        p++;
        continue;
      }
      const marker = bytes[p + 1];
      if (marker === 217 || marker === 218) break;
      const length = v.getUint16(p + 2);
      if (length < 2 || p + length + 2 > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = v.getUint16(p + 5);
        width = v.getUint16(p + 7);
        break;
      }
      p += length + 2;
    }
  } else if (
    bytes.length >= 30 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    mimeType = "image/webp";
    const kind = new TextDecoder().decode(bytes.slice(12, 16));
    if (kind === "VP8X") {
      if (bytes[20] & 2)
        throw new DomainError("VALIDATION_FAILED", "暂不支持动态 WebP");
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === "VP8 ") {
      width = v.getUint16(26, true) & 16383;
      height = v.getUint16(28, true) & 16383;
    } else if (kind === "VP8L" && bytes[20] === 47) {
      const bits = v.getUint32(21, true);
      width = (bits & 16383) + 1;
      height = ((bits >>> 14) & 16383) + 1;
    }
  } else
    throw new DomainError(
      "VALIDATION_FAILED",
      "请使用静态 PNG、JPEG 或 WebP 图片",
    );
  if (
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 40000000
  )
    throw new DomainError(
      "VALIDATION_FAILED",
      "图片尺寸无效或超过 8192 边长 / 4000 万像素",
    );
  return { width, height, mimeType };
}
