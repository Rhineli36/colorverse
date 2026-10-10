import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { imageInfo } from "@colorverse/package-io";
import { DomainError } from "@colorverse/domain";
import type { CourseDatabase } from "./database";
export class PrivateMedia {
  constructor(
    private root: string,
    private db: CourseDatabase,
  ) {
    this.root = resolve(root);
  }
  async upload(userId: string, bytes: Buffer, declaredHash: string) {
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw new DomainError("QUOTA_EXCEEDED", "每张图片不能超过20 MiB");
    const { rows } = await this.db.query(
      "SELECT 1 FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE user_id=$1 AND role='student' AND status='active' AND c.archived_at IS NULL LIMIT 1",
      [userId],
    );
    if (!rows.length)
      throw new DomainError("FORBIDDEN", "只有在读学生可以上传作业图片");
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== declaredHash)
      throw new DomainError("HASH_MISMATCH", "图片校验失败，请重新上传");
    const header = imageInfo(bytes),
      image = sharp(bytes, { limitInputPixels: 40000000 });
    const metadata = await image.metadata().catch(() => {
      throw new DomainError(
        "VALIDATION_FAILED",
        "图片无法解码，请换一张有效图片",
      );
    });
    if (
      (metadata.pages ?? 1) !== 1 ||
      metadata.width !== header.width ||
      metadata.height !== header.height
    )
      throw new DomainError("VALIDATION_FAILED", "图片格式或尺寸不正确");
    const display = await image
      .rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer()
      .catch(() => {
        throw new DomainError(
          "VALIDATION_FAILED",
          "图片无法完整解码，请重新导出后上传",
        );
      });
    const id = randomUUID(),
      key = id,
      directory = join(this.root, key);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "original"), bytes, { flag: "wx" });
    await writeFile(join(directory, "display.webp"), display, { flag: "wx" });
    try {
      await this.db.transaction(async (sql) => {
        // Serialize quota checks for concurrent uploads by this user.
        await sql.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          userId,
        ]);
        const usage = await sql.query(
          "SELECT COALESCE(sum(byte_size),0) AS bytes FROM assets WHERE owner_user_id=$1",
          [userId],
        );
        if (Number(usage.rows[0].bytes) + bytes.length > 500 * 1024 * 1024)
          throw new DomainError(
            "QUOTA_EXCEEDED",
            "测试账户图片总量不能超过500 MiB",
          );
        await sql.query(
          "INSERT INTO assets(id,owner_user_id,sha256,mime_type,byte_size,width,height,storage_key,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready')",
          [
            id,
            userId,
            hash,
            header.mimeType,
            bytes.length,
            header.width,
            header.height,
            key,
          ],
        );
      });
    } catch (error) {
      await unlink(join(directory, "original"));
      await unlink(join(directory, "display.webp"));
      throw error;
    }
    return {
      id,
      sha256: hash,
      mimeType: header.mimeType,
      byteSize: bytes.length,
      width: header.width,
      height: header.height,
    };
  }
  async display(storageKey: string) {
    if (!/^[a-f0-9-]{36}$/.test(storageKey))
      throw new DomainError("VALIDATION_FAILED", "图片引用无效");
    return readFile(join(this.root, storageKey, "display.webp"));
  }
}
