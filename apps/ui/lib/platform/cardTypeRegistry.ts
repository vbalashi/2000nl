import type { TrainingMode } from "@/lib/types";

export const PLATFORM_CARD_TYPE_IDS = [
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
  "listen-type",
] as const satisfies readonly TrainingMode[];

const platformCardTypeIds = new Set<string>(PLATFORM_CARD_TYPE_IDS);

export function isPlatformCardTypeId(value: string): value is TrainingMode {
  return platformCardTypeIds.has(value);
}
