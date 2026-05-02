import { z } from "zod";
import type { FishSpeciesDefinition } from "./types";

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

export const swimMotionProfileSchema = z.object({
  kickIntervalSecMin: z.number().finite().positive(),
  kickIntervalSecMax: z.number().finite().positive(),
  kickDurationSec: z.number().finite().positive(),
  coastDragPerSec: z.number().finite().min(0).max(1),
  wanderStrength: z.number().finite().min(0).max(1),
}).refine((profile) => profile.kickIntervalSecMin <= profile.kickIntervalSecMax, {
  message: "motion.kickIntervalSecMin must be <= motion.kickIntervalSecMax",
  path: ["kickIntervalSecMin"],
});

export const fishSpeciesDefinitionSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  realBodyLengthCm: z.number().finite().positive(),
  sideImage: z.string().min(1),
  sourceBodyBounds: bodyBoundsSchema,
  cruisingSpeedCmPerSec: z.number().finite().positive(),
  burstSpeedCmPerSec: z.number().finite().positive(),
  turnRateRadPerSec: z.number().finite().positive(),
  stopProbabilityPerSec: z.number().finite().min(0).max(1),
  motion: swimMotionProfileSchema,
  preferredZone: preferredZoneSchema,
  schooling: schoolingProfileSchema,
}) satisfies z.ZodType<FishSpeciesDefinition>;

export function parseFishSpeciesDefinition(
  value: unknown,
): FishSpeciesDefinition {
  return fishSpeciesDefinitionSchema.parse(value);
}
