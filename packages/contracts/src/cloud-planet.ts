import { z } from "zod";

export const CloudPlanetPresets = [
  { name: "流焰星", color: "#efa568" },
  { name: "翡翠星", color: "#82c9ae" },
  { name: "潮汐星", color: "#5a9dde" },
  { name: "紫雾星", color: "#b397d4" },
  { name: "霜蓝星", color: "#92c7df" },
  { name: "月岩星", color: "#c5bdaa" },
] as const;

export const CloudPlanetAppearanceInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[a-f0-9]{6}$/i),
  skin: z.number().int().min(0).max(5).default(0),
});
export const CloudPlanetDocumentSchema = z.object({
  metadata: z.object({ name: z.string() }),
  color: z.string().default("#82c9c7"),
  skin: z.number().int().min(0).max(5).default(0),
  revision: z.number().int().nonnegative().default(0),
  media: z
    .object({
      exterior: z.object({ id: z.uuid() }).optional(),
      interior: z.object({ id: z.uuid() }).optional(),
    })
    .default({}),
});
