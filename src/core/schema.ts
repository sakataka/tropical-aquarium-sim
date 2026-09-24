import { z } from "zod";
import type { FishSpeciesDefinition } from "./types";

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
  swim: z.object({
    tailBeatHz: z.number().finite().positive().max(8),
    bodyWaveStart: z.number().finite().min(0).max(1),
    waveCount: z.number().finite().positive().max(3),
    tailSweepRad: z.number().finite().min(0).max(1.2),
    verticalFlex: z.number().finite().min(0).max(0.2),
  }).partial().optional(),
  visual: z.object({ fallbackColor: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  sourceBodyBounds: bodyBoundsSchema,
  preferredZone: preferredZoneSchema,
  ecology: ecologySchema,
}) satisfies z.ZodType<FishSpeciesDefinition>;

export function parseFishSpeciesDefinition(value: unknown): FishSpeciesDefinition {
  return fishSpeciesDefinitionSchema.parse(value);
}
