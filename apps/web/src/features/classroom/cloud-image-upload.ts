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
