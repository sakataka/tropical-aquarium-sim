import { z } from "zod";
import catalogJson from "../content/environment/catalog.json";
import type { DecorAssetDefinition, DecorSlotId } from "./types";

export const DECOR_SLOT_IDS = [
  "rear-left",
  "rear-right",
  "mid-left",
  "mid-right",
  "front-left",
  "front-center",
  "front-right",
] as const satisfies readonly DecorSlotId[];

export const DECOR_SLOT_LABELS: Record<DecorSlotId, string> = {
  "rear-left": "後景・左",
  "rear-right": "後景・右",
  "mid-left": "中景・左",
  "mid-right": "中景・右",
  "front-left": "前景・左",
  "front-center": "前景・中央",
  "front-right": "前景・右",
};

const decorAssetSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  category: z.enum(["background", "substrate", "rear", "mid", "front"]),
  allowedSlots: z.array(z.enum(DECOR_SLOT_IDS)),
  scale: z.number().finite().positive(),
  anchorY: z.number().finite().min(0).max(1),
}) satisfies z.ZodType<DecorAssetDefinition>;

const parsed = z.object({ assets: z.array(decorAssetSchema) }).parse(catalogJson);

export const decorAssets = parsed.assets;
export const decorAssetsById = Object.fromEntries(
  decorAssets.map((asset) => [asset.id, asset]),
) as Record<string, DecorAssetDefinition>;

export function getAssetsForSlot(slotId: DecorSlotId): DecorAssetDefinition[] {
  return decorAssets.filter((asset) => asset.allowedSlots.includes(slotId));
}
