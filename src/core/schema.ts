import { z } from "zod";
import type { FishGuideEntry, FishSpeciesDefinition } from "./types";

export const bodyBoundsSchema = z.object({
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const preferredZoneSchema = z
  .object({
    minX: z.number().finite().min(0).max(1),
    maxX: z.number().finite().min(0).max(1),
    minY: z.number().finite().min(0).max(1),
    maxY: z.number().finite().min(0).max(1),
  })
  .refine((zone) => zone.minX < zone.maxX, {
    message: "preferredZone.minX must be less than preferredZone.maxX",
    path: ["minX"],
  })
  .refine((zone) => zone.minY < zone.maxY, {
    message: "preferredZone.minY must be less than preferredZone.maxY",
    path: ["minY"],
  });

export const schoolingProfileSchema = z.object({
  enabled: z.boolean(),
  radiusCm: z.number().finite().positive(),
  strength: z.number().finite().min(0).max(1),
});

export const speciesBehaviorProfileSchema = z.object({
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
  foodResponsiveness: z.number().finite().min(0).max(1),
  tapResponsiveness: z.number().finite().min(0).max(1),
  tapResponse: z.enum(["flee", "freeze", "approach"]),
  tapSurfaceBias: z.number().finite().min(0).max(1),
  tapStructureBias: z.number().finite().min(0).max(1),
  structurePatrolStrength: z.number().finite().min(0).max(1),
}).refine((profile) => profile.separationBodyLengths < profile.alignmentBodyLengths, {
  message: "behavior.separationBodyLengths must be < behavior.alignmentBodyLengths",
  path: ["separationBodyLengths"],
}).refine((profile) => profile.alignmentBodyLengths < profile.attractionBodyLengths, {
  message: "behavior.alignmentBodyLengths must be < behavior.attractionBodyLengths",
  path: ["alignmentBodyLengths"],
});

export const swimMotionProfileSchema = z.object({
  kickIntervalSecMin: z.number().finite().positive(),
  kickIntervalSecMax: z.number().finite().positive(),
  kickDurationSec: z.number().finite().positive(),
  pauseDurationSecMin: z.number().finite().positive(),
  pauseDurationSecMax: z.number().finite().positive(),
  feedDurationSecMin: z.number().finite().positive(),
  feedDurationSecMax: z.number().finite().positive(),
  feedSpeedMultiplier: z.number().finite().positive().max(2),
  coastDragPerSec: z.number().finite().min(0).max(1),
  wanderStrength: z.number().finite().min(0).max(1),
}).refine((profile) => profile.kickIntervalSecMin <= profile.kickIntervalSecMax, {
  message: "motion.kickIntervalSecMin must be <= motion.kickIntervalSecMax",
  path: ["kickIntervalSecMin"],
}).refine((profile) => profile.pauseDurationSecMin <= profile.pauseDurationSecMax, {
  message: "motion.pauseDurationSecMin must be <= motion.pauseDurationSecMax",
  path: ["pauseDurationSecMin"],
}).refine((profile) => profile.feedDurationSecMin <= profile.feedDurationSecMax, {
  message: "motion.feedDurationSecMin must be <= motion.feedDurationSecMax",
  path: ["feedDurationSecMin"],
});

export const fishAnimationProfileSchema = z.object({
  framePattern: z.string().min(1),
  framesPerSecond: z.number().finite().positive().max(30),
});

export const fishVisualProfileSchema = z.object({
  fallbackColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const fishSpeciesDefinitionSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  realBodyLengthCm: z.number().finite().positive(),
  sideImage: z.string().min(1),
  animation: fishAnimationProfileSchema.optional(),
  visual: fishVisualProfileSchema.optional(),
  sourceBodyBounds: bodyBoundsSchema,
  cruisingSpeedCmPerSec: z.number().finite().positive(),
  burstSpeedCmPerSec: z.number().finite().positive(),
  turnRateRadPerSec: z.number().finite().positive(),
  stopProbabilityPerSec: z.number().finite().min(0).max(1),
  motion: swimMotionProfileSchema,
  preferredZone: preferredZoneSchema,
  schooling: schoolingProfileSchema,
  behavior: speciesBehaviorProfileSchema,
}) satisfies z.ZodType<FishSpeciesDefinition>;

export const fishGuideEntrySchema = z.object({
  scientificName: z.string().min(1),
  origin: z.string().min(1),
  temperament: z.string().min(1),
  movement: z.string().min(1),
  habitat: z.string().min(1),
  note: z.string().min(1),
}) satisfies z.ZodType<FishGuideEntry>;

export const fishGuideSchema = z.record(fishGuideEntrySchema);

export function parseFishSpeciesDefinition(
  value: unknown,
): FishSpeciesDefinition {
  return fishSpeciesDefinitionSchema.parse(value);
}
