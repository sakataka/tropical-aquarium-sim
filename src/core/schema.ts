import { z } from "zod";
import { BODY_PLAN_IDS } from "./bodyPlans";
import { SHELTER_KINDS, type FishSpeciesDefinition } from "./types";

const bodyBoundsSchema = z.object({
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const preferredZoneSchema = z.object({
  minX: z.number().finite().min(0).max(1),
  maxX: z.number().finite().min(0).max(1),
  minY: z.number().finite().min(0).max(1),
  maxY: z.number().finite().min(0).max(1),
}).refine((zone) => zone.minX < zone.maxX && zone.minY < zone.maxY, {
  message: "preferredZone minimums must be below maximums",
});

const rangeSchema = z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()])
  .refine(([min, max]) => min <= max, { message: "range minimum must be below maximum" });

const habitSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("airBreathing"),
    breathsPerHour: rangeSchema,
    style: z.enum(["dash", "rise"]),
  }),
  z.object({
    type: z.literal("bottomRest"),
    chancePerMin: z.number().finite().min(0).max(10),
    durationSec: rangeSchema,
  }),
  z.object({
    type: z.literal("burrow"),
    chancePerMin: z.number().finite().min(0).max(10),
    durationSec: rangeSchema,
  }),
  z.object({ type: z.literal("bottomForage") }),
  z.object({
    type: z.literal("grazing"),
    chancePerMin: z.number().finite().min(0).max(10),
    durationSec: rangeSchema,
  }),
  z.object({ type: z.literal("hideByDay"), durationSec: rangeSchema }),
  z.object({
    type: z.literal("follow"),
    chancePerMin: z.number().finite().min(0).max(10),
    durationSec: rangeSchema,
  }),
  z.object({
    type: z.literal("homeShelter"),
    kind: z.enum(SHELTER_KINDS),
    rangeBodyLengths: z.number().finite().positive().max(40),
    visitChancePerMin: z.number().finite().min(0).max(10),
    visitDurationSec: rangeSchema,
  }),
]);

const unit = z.number().finite().min(0).max(1);

const ecologySchema = z.object({
  activityPeriod: z.enum(["diurnal", "crepuscular", "nocturnal"]),
  gait: z.enum(["burstCoast", "steady", "glide", "undulate"]),
  speedBodyLengthsPerSec: z.object({
    cruise: z.number().finite().positive().max(5),
    burst: z.number().finite().positive().max(15),
  }).refine((speed) => speed.cruise <= speed.burst, {
    message: "cruise speed must not exceed burst speed",
  }),
  turnRateRadPerSec: z.number().finite().positive().max(8),
  restFraction: unit,
  depthRange: z.tuple([unit, unit]).refine(([min, max]) => min <= max, {
    message: "depthRange minimum must be below maximum",
  }),
  social: z.object({
    grouping: z.enum(["school", "shoal", "group", "solitary"]),
    spacingBodyLengths: z.number().finite().positive().max(10),
    cohesion: unit,
    polarization: unit,
  }),
  structureAffinity: unit,
  habits: z.array(habitSchema),
  sources: z.array(z.object({ title: z.string().min(1), url: z.url() })).min(1),
});

const profileSchema = z.object({
  taxonomy: z.object({
    order: z.string().min(1),
    orderJa: z.string().min(1),
    family: z.string().min(1),
    familyJa: z.string().min(1),
  }),
  adultSizeCm: z.number().finite().positive(),
  sizeNote: z.string().min(1),
  distribution: z.string().min(1),
  water: z.object({
    salinity: z.enum(["freshwater", "brackish", "marine"]),
    temperatureC: z.tuple([z.number().finite(), z.number().finite()])
      .refine(([min, max]) => min <= max, { message: "temperature minimum must be below maximum" }).optional(),
    pH: z.tuple([z.number().finite().min(0).max(14), z.number().finite().min(0).max(14)])
      .refine(([min, max]) => min <= max, { message: "pH minimum must be below maximum" }).optional(),
  }),
  keeping: z.enum(["home", "publicAquarium", "rarelyDisplayed"]),
  conservation: z.object({
    status: z.enum(["LC", "NT", "VU", "EN", "CR", "EW", "DD", "NE"]).optional(),
    assessedYear: z.number().int().min(1990).max(2100).optional(),
    note: z.string().min(1).optional(),
  }),
  highlights: z.array(z.string().min(1)).min(1),
});

const fishSpeciesDefinitionSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  realBodyLengthCm: z.number().finite().positive(),
  catalog: z.object({
    scientificName: z.string().min(1),
    originRegionId: z.string().min(1),
    originRegionName: z.string().min(1),
    origin: z.string().min(1),
    temperament: z.string().min(1),
    movement: z.string().min(1),
    habitat: z.string().min(1),
    aliases: z.array(z.string().min(1)).optional(),
  }),
  profile: profileSchema,
  swim: z.object({
    tailBeatHz: z.number().finite().positive().max(8),
    bodyWaveStart: z.number().finite().min(0).max(1),
    waveCount: z.number().finite().positive().max(3),
    tailSweepRad: z.number().finite().min(0).max(1.2),
    verticalFlex: z.number().finite().min(0).max(0.2),
    bodyPlan: z.enum(BODY_PLAN_IDS),
    headStart: z.number().finite().min(0).max(0.8),
    mouthAnchor: z.object({ x: unit, y: unit }),
    footAnchor: z.object({ x: unit, y: unit }),
    bell: z.object({ top: unit, bottom: unit }).refine((bell) => bell.top < bell.bottom, {
      message: "bell top must be above its bottom",
    }),
    fins: z.array(z.object({ x: unit, y: unit, radius: unit.gt(0) })).min(1),
    tailStartY: unit,
    wings: z.object({ rootX: z.number().finite().min(0).max(0.5), y: unit, top: unit, bottom: unit })
      .refine((wings) => wings.top < wings.bottom && wings.top <= wings.y && wings.y <= wings.bottom, {
        message: "wings must span top <= y <= bottom",
      }),
    legs: z.array(z.object({
      x: unit, y: unit, footX: unit, footY: unit, width: unit.gt(0), beat: z.union([z.literal(0), z.literal(1)]),
      knee: z.object({ x: unit, y: unit }).optional(),
    })).min(2),
    spine: z.array(z.object({ x: unit, y: unit })).min(3)
      .refine((points) => points.every((point, i) => i === 0 || point.y > points[i - 1]!.y), {
        message: "spine points must run from the neck down to the tail tip",
      }),
    limbs: z.array(z.object({
      kind: z.enum(["hind", "fore"]),
      joints: z.array(z.object({ x: unit, y: unit })),
    }).refine((limb) => limb.joints.length === (limb.kind === "hind" ? 4 : 3), {
      message: "a hind limb has hip, knee, ankle and toe; a fore limb has shoulder, elbow and hand",
    })).min(2),
    radial: z.object({ x: unit, y: unit, radius: unit.gt(0), reach: unit.gt(0) })
      .refine((radial) => radial.radius < radial.reach, { message: "radial reach must lie beyond the body radius" }),
    shell: z.array(z.object({ x: unit, y: unit, rx: unit.gt(0), ry: unit.gt(0) })).min(1),
    feelers: z.array(z.object({
      kind: z.enum(["tentacle", "rhinophore", "gill"]),
      base: z.object({ x: unit, y: unit }),
      tip: z.object({ x: unit, y: unit }),
      width: unit.gt(0),
    }).refine((feeler) => Math.hypot(feeler.tip.x - feeler.base.x, feeler.tip.y - feeler.base.y) > 0.01, {
      message: "a feeler's tip must lie away from its base",
    })).min(1),
  }).partial().optional(),
  visual: z.object({ fallbackColor: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  sourceBodyBounds: bodyBoundsSchema,
  preferredZone: preferredZoneSchema,
  ecology: ecologySchema,
}).superRefine((species, ctx) => {
  // 真横の両生類は足が付け根より下。斜めから見たカニの奥側の脚には、この制約を当てない。
  if (species.swim?.bodyPlan === "crab") return;
  species.swim?.legs?.forEach((leg, index) => {
    if (leg.y >= leg.footY) ctx.addIssue({ code: "custom", path: ["swim", "legs", index],
      message: "a leg's foot must be below its root" });
  });
}) satisfies z.ZodType<FishSpeciesDefinition>;

export function parseFishSpeciesDefinition(value: unknown): FishSpeciesDefinition {
  return fishSpeciesDefinitionSchema.parse(value);
}
