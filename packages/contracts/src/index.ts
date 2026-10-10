import { z } from "zod";
import { GrowthPresetIds } from "./growth-presets";
export * from "./growth-presets";
export * from "./course";

export const VERSION = "1.0.0" as const;
export const id = z.uuid();
export const color = z.string().regex(/^#[\da-f]{6}$/i);
const finite = (min: number, max: number) =>
  z.number().finite().min(min).max(max);
export const TransformSchema = z.strictObject({
  x: finite(-16000, 16000),
  y: finite(-16000, 16000),
  scaleX: finite(0.01, 10),
  scaleY: finite(0.01, 10),
  rotationDeg: finite(-180, 180),
  anchorX: finite(0, 1),
  anchorY: finite(0, 1),
});
export const CropSchema = z.strictObject({
  x: finite(0, 0.99),
  y: finite(0, 0.99),
  width: finite(0.01, 1),
  height: finite(0.01, 1),
});
export type ImageCrop = z.infer<typeof CropSchema>;
export type Transform = z.infer<typeof TransformSchema>;
export const AdjustmentsSchema = z.strictObject({
  hueDeg: finite(-180, 180),
  saturation: finite(0, 2),
  brightness: finite(0, 2),
  contrast: finite(0, 2),
  temperature: finite(-1, 1),
});
export const defaultAdjustments = () => ({
  hueDeg: 0,
  saturation: 1,
  brightness: 1,
  contrast: 1,
  temperature: 0,
});
export const defaultTransform = (x = 800, y = 450) => ({
  x,
  y,
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  anchorX: 0.5,
  anchorY: 0.5,
});
export const EffectIds = [
  "stardust",
  "fireflies",
  "floating-lights",
  "rain",
  "snow",
  "fog",
  "outer-glow",
  "soft-glow",
  "light-beam",
  "breathe",
  "ring",
  "halo",
  "rim-light",
  "satellite",
] as const;
export const EffectParamsSchema = z.strictObject({
  color,
  intensity: finite(0, 1),
  density: finite(0, 1),
  opacity: finite(0, 1),
  speed: finite(0, 2),
  seed: z.number().int().min(0).max(4294967295),
  orbitRadiusPx: finite(100, 600).optional(),
  satelliteRadiusPx: finite(4, 60).optional(),
  satelliteCount: z.number().int().min(1).max(3).optional(),
  orbitTilt: finite(0.15, 0.9).optional(),
});
export const GrowthParamsSchema = z.strictObject({
  x: finite(0, 1),
  y: finite(0, 1),
  scale: finite(0.1, 2),
  rotationDeg: finite(-180, 180),
  color,
  opacity: finite(0, 1),
  glowIntensity: finite(0, 1),
  motionSpeed: finite(0, 2),
  seed: z.number().int().min(0).max(4294967295),
});
const SphereParamsSchema = z.strictObject({
  color,
  light: finite(0, 1),
  textureAssetId: id.nullable(),
});
export const LayerSchema = z.strictObject({
  id,
  kind: z.enum(["image", "preset", "effect"]),
  depth: z.enum(["background", "middle", "foreground"]),
  order: z.number().int().min(0).max(10000),
  transform: TransformSchema,
  opacity: finite(0, 1),
  visible: z.boolean(),
  adjustments: AdjustmentsSchema,
  animation: z
    .array(
      z.discriminatedUnion("type", [
        z.strictObject({
          type: z.literal("float"),
          amplitudePx: finite(0, 30),
          periodSec: finite(1, 60),
        }),
        z.strictObject({
          type: z.literal("rotate"),
          degreesPerSec: finite(-30, 30),
        }),
        z.strictObject({
          type: z.literal("breathe"),
          minOpacity: finite(0, 1),
          maxOpacity: finite(0, 1),
          periodSec: finite(1, 60),
        }),
      ]),
    )
    .max(3),
  parallaxFactor: finite(-0.1, 0.1),
  source: z.union([
    z.strictObject({ assetId: id, crop: CropSchema.optional() }),
    z.strictObject({
      effectId: z.enum(EffectIds),
      effectVersion: z.literal(VERSION),
      anchorLayerId: id.optional(),
      params: EffectParamsSchema,
    }),
    z.strictObject({
      presetId: z.enum(GrowthPresetIds),
      presetVersion: z.literal(VERSION),
      params: GrowthParamsSchema,
    }),
    z.strictObject({
      presetId: z.literal("sphere"),
      presetVersion: z.literal(VERSION),
      params: SphereParamsSchema,
    }),
  ]),
});
const Geometry = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("circle"),
    x: finite(-16000, 16000),
    y: finite(-16000, 16000),
    radius: finite(1, 2000),
  }),
  z.strictObject({
    type: z.literal("rect"),
    x: finite(-16000, 16000),
    y: finite(-16000, 16000),
    width: finite(1, 16000),
    height: finite(1, 16000),
  }),
]);
export const HotspotSchema = z.strictObject({
  id,
  sceneId: id,
  anchorLayerId: id.nullable(),
  geometry: Geometry,
  accessibleLabel: z.string().min(1).max(120),
  action: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("showText"), text: z.string().max(4000) }),
    z.strictObject({
      type: z.literal("showImage"),
      assetId: id,
      caption: z.string().max(400),
    }),
    z.strictObject({ type: z.literal("openArchive"), archiveEntryId: id }),
  ]),
});
export const SceneSchema = z.strictObject({
  id,
  width: finite(100, 4096),
  height: finite(100, 4096),
  background: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("color"), color }),
    z.strictObject({
      type: z.literal("linearGradient"),
      angleDeg: finite(-180, 180),
      stops: z
        .array(z.strictObject({ offset: finite(0, 1), color }))
        .min(2)
        .max(8),
    }),
    z.strictObject({
      type: z.literal("image"),
      assetId: id,
      fit: z.enum(["contain", "cover"]),
      color,
    }),
  ]),
  layers: z.array(LayerSchema).max(50),
  hotspots: z.array(HotspotSchema).max(30),
  tombstones: z.array(id).max(500),
});
export const AssetFileSchema = z.strictObject({
  path: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  mimeType: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
  ]),
  width: z.number().int().positive().max(8192).optional(),
  height: z.number().int().positive().max(8192).optional(),
  durationMs: z.number().positive().max(300000).optional(),
});
export const AssetSchema = z.strictObject({
  assetId: id,
  original: AssetFileSchema,
  variants: z
    .array(
      AssetFileSchema.extend({
        kind: z.enum(["thumbnail", "display"]),
        recipeVersion: z.string().max(40),
      }),
    )
    .max(8),
  rights: z.strictObject({
    creator: z.string().max(120),
    license: z.string().max(120),
    source: z.string().max(400),
    consentToPublish: z.boolean(),
  }),
});
export const ArchiveSchema = z.strictObject({
  id,
  sourceType: z.enum(["sample", "student"]),
  title: z.string().min(1).max(120),
  createdOn: z.iso.date(),
  courseModule: z.string().max(120),
  imageAssetIds: z.array(id).max(20),
  description: z.string().max(4000),
  colorTags: z.array(z.string().max(24)).max(12),
});
export const GrowthElementSchema = z.strictObject({
  layerId: id,
  sceneKind: z.enum(["exterior", "interior"]),
  presetId: z.enum(GrowthPresetIds),
  presetVersion: z.literal(VERSION),
  params: GrowthParamsSchema,
});
export const GrowthSchemaBase = z.strictObject({
  schemaVersion: z.literal(VERSION),
  eventId: id,
  planetId: id,
  trigger: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("archive"),
      archiveEntryId: id,
      idempotencyKey: z.string().min(8).max(160),
    }),
    z.strictObject({
      kind: z.literal("mock"),
      mockSubmissionId: id,
      archiveEntryId: id,
      idempotencyKey: z.string().min(8).max(160),
    }),
    z.strictObject({
      kind: z.literal("submission"),
      submissionVersionId: id,
      idempotencyKey: z.string().min(8).max(160),
    }),
  ]),
  baseRevision: z.number().int().min(0),
  status: z.enum(["proposed", "accepted", "rejected", "reverted"]),
  summary: z.string().min(1).max(600),
  elements: z.array(GrowthElementSchema).min(1).max(3),
  createdAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  appliedRevision: z.number().int().positive().nullable(),
  revertedAt: z.iso.datetime().nullable(),
  revertedRevision: z.number().int().positive().nullable(),
  provider: z.strictObject({
    kind: z.enum(["mock", "model", "rules"]),
    adapter: z.string().min(1).max(80),
    model: z.string().min(1).max(120),
    promptVersion: z.string().min(1).max(40),
  }),
  policyVersion: z.string().min(1).max(40),
  sourceProposalHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const GrowthSchema = GrowthSchemaBase.superRefine((e, ctx) => {
  const applied = e.status === "accepted" || e.status === "reverted";
  if (applied !== (e.acceptedAt !== null && e.appliedRevision !== null))
    ctx.addIssue({ code: "custom", message: "成长状态与应用记录不一致" });
  if (!applied && (e.acceptedAt !== null || e.appliedRevision !== null))
    ctx.addIssue({ code: "custom", message: "未接受事件不能已应用" });
  if (
    (e.status === "reverted") !==
    (e.revertedAt !== null && e.revertedRevision !== null)
  )
    ctx.addIssue({ code: "custom", message: "撤销记录不完整" });
  if (
    e.status !== "reverted" &&
    (e.revertedAt !== null || e.revertedRevision !== null)
  )
    ctx.addIssue({ code: "custom", message: "状态与撤销记录冲突" });
  if (e.appliedRevision !== null && e.appliedRevision <= e.baseRevision)
    ctx.addIssue({ code: "custom", message: "应用版本必须递增" });
});
export const PlanetSchema = z.strictObject({
  schemaVersion: z.literal(VERSION),
  planetId: id,
  revision: z.number().int().min(0),
  metadata: z.strictObject({
    name: z.string().min(1).max(80),
    authorDisplayName: z.string().min(1).max(80),
    theme: z.string().max(200),
    emotionTags: z.array(z.string().min(1).max(24)).max(12),
    palette: z.strictObject({
      primary: color,
      secondary: color,
      accent: color,
    }),
    description: z.string().max(4000),
    monologue: z.string().max(4000),
  }),
  exterior: z.strictObject({
    mode: z.enum(["artwork", "presetSphere"]),
    scene: SceneSchema,
  }),
  interior: SceneSchema,
  assetRefs: z.array(AssetSchema).max(200),
  archiveEntries: z.array(ArchiveSchema).max(500),
  growthEvents: z.array(GrowthSchema).max(100),
  requiredCapabilities: z.array(z.string().max(80)).max(30),
  optionalCapabilities: z.array(z.string().max(80)).max(30),
  extensions: z.record(z.string(), z.json()).optional(),
});
export const MOTION_CAPABILITY = "motion-presets@1";
export const MotionSchema = z.strictObject({
  version: z.literal(VERSION),
  mode: z.enum(["stationary", "slow", "fast"]),
  trajectory: z.enum(["circle", "ellipse", "figure-eight", "drift"]),
  range: z.enum(["compact", "regular", "wide"]),
  direction: z.enum(["forward", "reverse"]),
});
export type PlanetMotion = z.infer<typeof MotionSchema>;
export const LegacyUniverseSchema = z.strictObject({
  schemaVersion: z.literal(VERSION),
  universeId: id,
  name: z.string().min(1).max(120),
  layout: z.strictObject({
    version: z.literal(VERSION),
    seed: z.number().int(),
    camera: z.strictObject({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: finite(0.04, 2.5),
    }),
  }),
  entries: z
    .array(
      z.strictObject({
        planetId: id,
        visible: z.boolean(),
        position: z.strictObject({
          x: z.number().finite(),
          y: z.number().finite(),
        }),
        scale: finite(0.1, 2),
        order: z.number().int(),
        motion: z.never().optional(),
        layoutRevision: z.never().optional(),
      }),
    )
    .max(300),
  requiredCapabilities: z.never().optional(),
});
export const MotionUniverseSchema = LegacyUniverseSchema.extend({
  schemaVersion: z.literal("1.1.0"),
  layout: LegacyUniverseSchema.shape.layout.extend({
    version: z.literal("1.1.0"),
  }),
  entries: z
    .array(
      LegacyUniverseSchema.shape.entries.element.extend({
        motion: MotionSchema.optional(),
        layoutRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .max(300),
  requiredCapabilities: z.array(z.literal(MOTION_CAPABILITY)).length(1),
});
export const UniverseSchema = z.discriminatedUnion("schemaVersion", [
  LegacyUniverseSchema,
  MotionUniverseSchema,
]);
export type MotionUniverseDocument = z.infer<typeof MotionUniverseSchema>;
export type PlanetDocument = z.infer<typeof PlanetSchema>;
export type SceneDocument = z.infer<typeof SceneSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type Hotspot = z.infer<typeof HotspotSchema>;
export type AssetRecord = z.infer<typeof AssetSchema>;
export type AssetFile = z.infer<typeof AssetFileSchema>;
export type GrowthEvent = z.infer<typeof GrowthSchema>;
export type ArchiveEntry = z.infer<typeof ArchiveSchema>;
// The strict reader enforces each version's fields. A common entry array lets
// layout projections filter legacy and current documents without union-array casts.
export type UniverseDocument = Omit<
  z.infer<typeof UniverseSchema>,
  "entries"
> & {
  entries: z.infer<typeof UniverseSchema>["entries"][number][];
};
export type EffectParams = z.infer<typeof EffectParamsSchema>;
