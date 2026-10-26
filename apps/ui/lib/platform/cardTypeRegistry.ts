import type { TrainingMode } from "@/lib/types";
import { PLATFORM_V2_CARD_TYPE_IDS } from "../../../../packages/shared/types/platformV2";

export const PLATFORM_CARD_TYPE_IDS =
  PLATFORM_V2_CARD_TYPE_IDS satisfies readonly TrainingMode[];

const platformCardTypeIds = new Set<string>(PLATFORM_CARD_TYPE_IDS);

export function isPlatformCardTypeId(value: string): value is TrainingMode {
  return platformCardTypeIds.has(value);
}
