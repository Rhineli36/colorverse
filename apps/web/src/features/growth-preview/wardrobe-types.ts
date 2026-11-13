import { z } from "zod";
const Frame = z.enum([
  "silver",
  "gold",
  "sapphire",
  "emerald",
  "glass",
  "floral",
  "winter",
]);
export const WardrobeState = z.object({
  planetId: z.uuid(),
  unlocked: z.array(z.string()),
  bindings: z.array(
    z.object({
      skin_id: z.string(),
      task_id: z.string(),
      title: z.string().nullable(),
    }),
  ),
  progress: z
    .record(
      z.string(),
      z.object({
        current: z.number().int().nonnegative(),
        target: z.number().int().positive(),
        detail: z.string(),
      }),
    )
    .default({}),
  settings: z.object({
    frameId: Frame.nullable(),
    placement: z.object({
      x: z.number(),
      y: z.number(),
      amplitude: z.enum(["still", "gentle", "expressive"]),
    }),
    options: z.object({
      ringId: z
        .enum(["silver", "gold", "gem", "enamel", "jellyfish"])
        .nullable()
        .optional(),
      palette: z.enum(["gold", "moon", "rose"]).optional(),
      particles: z.boolean(),
      lantern: z.boolean(),
    }),
    revision: z.number().int(),
  }),
});
export type WardrobeData = z.infer<typeof WardrobeState>;
export type WardrobeSelection = WardrobeData["settings"];
