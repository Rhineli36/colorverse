import { z } from "zod";
export const ImagePlacementSchema = z.object({
  x: z.number().finite().min(-8).max(8).default(0),
  y: z.number().finite().min(-8).max(8).default(0),
  scale: z.number().finite().min(0.1).max(8).default(1),
});
export type ImagePlacement = z.infer<typeof ImagePlacementSchema>;
export const resetImagePlacement = (): ImagePlacement => ({
  x: 0,
  y: 0,
  scale: 1,
});
export function imageGeometry(
  width: number,
  height: number,
  frameWidth: number,
  frameHeight: number,
  p: ImagePlacement,
) {
  const scale = Math.max(frameWidth / width, frameHeight / height) * p.scale;
  return {
    width: width * scale,
    height: height * scale,
    left: (frameWidth - width * scale) / 2 + p.x * frameWidth,
    top: (frameHeight - height * scale) / 2 + p.y * frameHeight,
  };
}
export const StudentIdentitySchema = z.object({
  studentNumber: z.string().trim().min(1, "请填写学号").max(40),
  realName: z.string().trim().min(1, "请填写姓名").max(60),
});
export type StudentIdentity = z.infer<typeof StudentIdentitySchema>;
export function identityFromDisplayName(name: string): StudentIdentity | null {
  const m = /^(.+?)\s*[·・]\s*学号\s*(\S+)\s*$/.exec(name);
  return m
    ? StudentIdentitySchema.parse({ realName: m[1], studentNumber: m[2] })
    : null;
}
export function reviewStatus(score?: number | null, comment?: string | null) {
  return score != null
    ? `教师评分 ${score} 分`
    : comment?.trim()
      ? "已有评语 · 暂未评分"
      : "待评价";
}
export function hasTeacherReview(
  score?: number | null,
  comment?: string | null,
) {
  return score != null || Boolean(comment?.trim());
}
