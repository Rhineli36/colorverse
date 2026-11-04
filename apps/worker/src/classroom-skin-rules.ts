/** Counts come from server-side, deduplicated evidence, never browser input. */
export interface SkinCountEvidence {
  exteriorUploaded: boolean;
  interiorUploaded: boolean;
  interactions: number;
  receivedLikes: number;
  submittedAssignments: number;
}
export function eligibleCountSkins(e: SkinCountEvidence) {
  for (const count of [e.interactions, e.receivedLikes, e.submittedAssignments])
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("INVALID_SKIN_EVIDENCE");
  const result: string[] = [];
  if (e.exteriorUploaded && e.interiorUploaded) result.push("silver");
  if (e.interactions >= 20) result.push("gold");
  if (e.receivedLikes >= 10) result.push("sapphire");
  if (e.submittedAssignments >= 5) result.push("emerald");
  if (e.submittedAssignments >= 10) result.push("glass");
  if (e.interactions >= 50) result.push("floral");
  return result;
}
