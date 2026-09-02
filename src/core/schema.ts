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

const behaviorSchema = z.object({
  separationBodyLengths: z.number().finite().positive(),
  alignmentBodyLengths: z.number().finite().positive(),
  attractionBodyLengths: z.number().finite().positive(),
  separationStrength: z.number().finite().min(0).max(4),
  alignmentStrength: z.number().finite().min(0).max(4),
  attractionStrength: z.number().finite().min(0).max(4),
  wallAvoidanceStrength: z.number().finite().min(0).max(6),
  edgeCruiseChance: z.number().finite().min(0).max(1),
  structureAffinity: z.number().finite().min(0).max(1),
  surfaceAffinity: z.number().finite().min(0).max(1),
  zoneHoldStrength: z.number().finite().min(0).max(2),
  surfaceVisitChance: z.number().finite().min(0).max(1),
  structurePatrolStrength: z.number().finite().min(0).max(1),
}).refine((profile) =>
  profile.separationBodyLengths < profile.alignmentBodyLengths &&
  profile.alignmentBodyLengths < profile.attractionBodyLengths, {
  message: "behavior distances must be ordered separation < alignment < attraction",
});

const motionSchema = z.object({
  kickIntervalSecMin: z.number().finite().positive(),
  kickIntervalSecMax: z.number().finite().positive(),
  kickDurationSec: z.number().finite().positive(),
  pauseDurationSecMin: z.number().finite().positive(),
  pauseDurationSecMax: z.number().finite().positive(),
  coastDragPerSec: z.number().finite().min(0).max(1),
  wanderStrength: z.number().finite().min(0).max(1),
}).refine((profile) =>
  profile.kickIntervalSecMin <= profile.kickIntervalSecMax &&
  profile.pauseDurationSecMin <= profile.pauseDurationSecMax, {
  message: "motion minimums must be below maximums",
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
  animation: z.object({ framesPerSecond: z.number().finite().positive().max(30) }).optional(),
  visual: z.object({ fallbackColor: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  sourceBodyBounds: bodyBoundsSchema,
  cruisingSpeedCmPerSec: z.number().finite().positive(),
  burstSpeedCmPerSec: z.number().finite().positive(),
  turnRateRadPerSec: z.number().finite().positive(),
  stopProbabilityPerSec: z.number().finite().min(0).max(1),
  motion: motionSchema,
  preferredZone: preferredZoneSchema,
  schooling: z.object({
    enabled: z.boolean(),
    radiusCm: z.number().finite().positive(),
    strength: z.number().finite().min(0).max(1),
  }),
  behavior: behaviorSchema,
}) satisfies z.ZodType<FishSpeciesDefinition>;

export function parseFishSpeciesDefinition(value: unknown): FishSpeciesDefinition {
  return fishSpeciesDefinitionSchema.parse(value);
}
