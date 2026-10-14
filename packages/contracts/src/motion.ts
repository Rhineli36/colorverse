import { z } from "zod";

export const MOTION_CAPABILITY = "motion-presets@1";
export const MotionSchema = z.strictObject({
  version: z.literal("1.0.0"),
  mode: z.enum(["stationary", "slow", "fast"]),
  trajectory: z.enum(["circle", "ellipse", "figure-eight", "drift"]),
  range: z.enum(["compact", "regular", "wide"]),
  direction: z.enum(["forward", "reverse"]),
});
export type PlanetMotion = z.infer<typeof MotionSchema>;
