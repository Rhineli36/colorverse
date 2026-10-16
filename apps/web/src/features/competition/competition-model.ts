import { z } from "zod";
import {
  CloudPlanetDocumentSchema,
  GrowthPresetIds,
} from "@colorverse/contracts";
const SnapshotInteraction = z.object({
  kind: z.enum(["like", "emoji", "comment"]),
  content: z.string(),
  author: z.string(),
});
export const Work = z.strictObject({
  taskId: z.enum(["T01", "T02", "T03"]).nullable().optional(),
  color: z.string().optional(),
  id: z.string(),
  params: z
    .object({
      x: z.number(),
      y: z.number(),
      size: z.number(),
      motion: z.string(),
    })
    .optional(),
  createdAt: z.string().nullable().optional(),
  exampleDate: z.string().optional(),
  description: z.string().optional(),
  interactions: z
    .array(
      z.object({
        kind: z.enum(["like", "emoji", "comment"]),
        content: z.string(),
        author: z.string(),
      }),
    )
    .optional(),
  title: z.string(),
  image: z.string().regex(/^(?:[a-z0-9-]+\.webp|local:[a-f0-9-]+)$/),
  presetId: z.enum(GrowthPresetIds),
  score: z.number().min(0).max(100).optional(),
  comment: z.string().optional(),
});
export const Snapshot = z.strictObject({
  version: z.literal(1),
  students: z
    .array(
      z.strictObject({
        id: z.string(),
        display_name: z.string(),
        planetInteractions: z.array(SnapshotInteraction).optional(),
        realName: z.string().optional(),
        studentNumber: z.string().optional(),
        document: CloudPlanetDocumentSchema,
        exterior: z
          .string()
          .regex(/^(?:[a-z0-9-]+\.webp|local:[a-f0-9-]+)$/)
          .optional(),
        interior: z
          .string()
          .regex(/^(?:[a-z0-9-]+\.webp|local:[a-f0-9-]+)$/)
          .optional(),
        style: z.string().optional(),
        sent: z.number().int().nonnegative(),
        received: z.number().int().nonnegative(),
        works: z.array(Work).length(5),
      }),
    )
    .length(5),
  defaults: z
    .array(
      z.strictObject({
        id: z.string(),
        display_name: z.string(),
        document: CloudPlanetDocumentSchema,
        works: z.array(Work).length(0),
      }),
    )
    .length(5),
});
export type Data = z.infer<typeof Snapshot>;
export type Artwork = z.infer<typeof Work>;

export const ExperiencePlanet = Snapshot.shape.students.element.extend({
  works: z.array(Work).max(100),
  visible: z.boolean().default(true),
});
export type ExperiencePlanetData = z.infer<typeof ExperiencePlanet>;
