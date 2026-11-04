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
  unlocked: z.array(Frame),
  bindings: z.array(
    z.object({
      skin_id: z.string(),
      task_id: z.string(),
      title: z.string().nullable(),
    }),
  ),
  settings: z.object({
    frameId: Frame.nullable(),
    placement: z.object({
      x: z.number(),
      y: z.number(),
      amplitude: z.enum(["still", "gentle", "expressive"]),
    }),
    options: z.object({
      palette: z.enum(["gold", "moon", "rose"]).optional(),
      particles: z.boolean(),
      lantern: z.boolean(),
    }),
    revision: z.number().int(),
  }),
});
export type WardrobeData = z.infer<typeof WardrobeState>;
export type WardrobeSelection = WardrobeData["settings"];
