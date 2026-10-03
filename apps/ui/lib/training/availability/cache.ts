import { onPlatformV2CardStateChanged } from "@/lib/platform/platformV2CardStateChanges";
import { currentAvailabilityStudyDay, type TrainingAvailability } from "./model";

export const AVAILABILITY_CACHE_TTL_MS = 60000;
const MAX_CACHE_ENTRIES = 16;
const values = new Map<string, { value: TrainingAvailability; savedAt: number }>();
const listeners = new Set<(ownerId?: string) => void>();
let allGeneration = 0;
const ownerGenerations = new Map<string, number>();
export function trainingAvailabilityCacheGeneration(ownerId: string) {
  return `${allGeneration}:${ownerGenerations.get(ownerId) ?? 0}`;
}
export function readTrainingAvailabilityCache(key: string) {
  const item = values.get(key);
  return item && item.value.studyDay === currentAvailabilityStudyDay(item.value.timezone) ? item : undefined;
}
export function writeTrainingAvailabilityCache(key: string, value: TrainingAvailability) {
  values.delete(key);
  values.set(key, { value, savedAt: Date.now() });
  if (values.size > MAX_CACHE_ENTRIES) values.delete(values.keys().next().value!);
}
/** Pure browser cache clear. Does not depend on a mounted React consumer. */
export function clearTrainingAvailabilityCache(ownerId?: string) {
  if (ownerId) ownerGenerations.set(ownerId, (ownerGenerations.get(ownerId) ?? 0) + 1);
  else { allGeneration += 1; ownerGenerations.clear(); }
  for (const key of values.keys()) if (!ownerId || key.startsWith(JSON.stringify(ownerId) + ":")) values.delete(key);
}
/** An authoritative accepted mutation invalidates retained counts and active reads. */
export function invalidateTrainingAvailability(ownerId?: string) {
  clearTrainingAvailabilityCache(ownerId);
  for (const listener of listeners) listener(ownerId);
}
export function onTrainingAvailabilityInvalidated(listener: (ownerId?: string) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
// Domain subscription survives Training overview unmounting during grading.
// Ordinary action notifications have no owner payload, so clear every retained owner.
onPlatformV2CardStateChanged(() => invalidateTrainingAvailability());
