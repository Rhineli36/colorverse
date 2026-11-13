export const ClassroomImageLimitMb = 15;
export const LegacyClassroomImageLimitMb = 8;
export const BytesPerMiB = 1024 * 1024;
export const ClassroomImagePixelLimit = 32_000_000;
export const LegacyClassroomImagePixelLimit = 16_000_000;
export const ClassroomImageMaxSide = 8192;
export function classroomImagePixelLimit(classroomNext: boolean) {
  return classroomNext
    ? ClassroomImagePixelLimit
    : LegacyClassroomImagePixelLimit;
}
