"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AVAILABILITY_CACHE_TTL_MS, clearTrainingAvailabilityCache, onTrainingAvailabilityInvalidated,
  readTrainingAvailabilityCache, trainingAvailabilityCacheGeneration, writeTrainingAvailabilityCache } from "./cache";
export { AVAILABILITY_CACHE_TTL_MS, clearTrainingAvailabilityCache } from "./cache";
import { fetchTrainingAvailability } from "./client";
import { availabilityRecipeKey, currentAvailabilityStudyDay, type TrainingAvailability, type TrainingAvailabilityRecipe } from "./model";

export type TrainingAvailabilityState =
  | { status: "idle" | "loading" | "error" }
  | { status: "ready"; value: TrainingAvailability; refreshing: boolean; refreshFailed: boolean };
const ready = (value: TrainingAvailability, refreshing = false, refreshFailed = false): TrainingAvailabilityState =>
  ({ status: "ready", value, refreshing, refreshFailed });
/** Exactly one selected recipe; no background polling or fan-out to Saved Trainings.
 * Owner, normalized recipe, caller learning revision, event revision and study day scope reads.
 * Start remains authoritative even when these display-only counts are cached. */
export function useTrainingAvailability({ ownerId, recipe, enabled = true, refresh = 0 }: {
  ownerId: string | null; recipe: TrainingAvailabilityRecipe | null; enabled?: boolean; refresh?: string | number;
}): TrainingAvailabilityState & { reload: () => void } {
  const [, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; state: TrainingAvailabilityState } | null>(null);
  const previousOwner = useRef(ownerId);
  const scope = recipe ? availabilityRecipeKey(recipe) : null;
  const key = ownerId && scope ? `${JSON.stringify(ownerId)}:${scope}:${refresh}:${trainingAvailabilityCacheGeneration(ownerId)}` : null;
  const recipeRef = useRef(recipe);
  recipeRef.current = recipe;
  // Never expose a previous account's values for even one render.
  if (previousOwner.current !== ownerId) {
    if (previousOwner.current) clearTrainingAvailabilityCache(previousOwner.current);
    previousOwner.current = ownerId;
  }
  const reload = useCallback(() => {
    if (ownerId) clearTrainingAvailabilityCache(ownerId);
    setRevision(n => n + 1);
  }, [ownerId]);
  useEffect(() => onTrainingAvailabilityInvalidated(changedOwner => {
    if (!changedOwner || changedOwner === ownerId) setRevision(n => n + 1);
  }), [ownerId]);
  useEffect(() => {
    const checkDay = () => {
      if (!enabled || !key) return;
      const value = result?.key === key && result.state.status === "ready" ? result.state.value : readTrainingAvailabilityCache(key)?.value;
      if (value && currentAvailabilityStudyDay(value.timezone) !== value.studyDay) reload();
    };
    const onVisible = () => { if (document.visibilityState === "visible") checkDay(); };
    window.addEventListener("focus", checkDay);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", checkDay); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled, key, result, reload]);
  useEffect(() => {
    if (!enabled || !ownerId || !key || !recipeRef.current) return;
    const item = readTrainingAvailabilityCache(key);
    if (item && Date.now() - item.savedAt < AVAILABILITY_CACHE_TTL_MS) {
      setResult({ key, state: ready(item.value) });
      return;
    }
    let current = true;
    const generation = trainingAvailabilityCacheGeneration(ownerId);
    const controller = new AbortController();
    const publish = (state: TrainingAvailabilityState) => { if (current && generation === trainingAvailabilityCacheGeneration(ownerId)) setResult({ key, state }); };
    publish(item ? ready(item.value, true) : { status: "loading" });
    const timeout = window.setTimeout(() => {
      controller.abort();
      publish(item ? ready(item.value, false, true) : { status: "error" });
      current = false;
    }, 10000);
    void fetchTrainingAvailability(ownerId, recipeRef.current, controller.signal).then(value => {
      if (!current || generation !== trainingAvailabilityCacheGeneration(ownerId)) return;
      writeTrainingAvailabilityCache(key, value);
      publish(ready(value));
    }).catch(() => publish(item ? ready(item.value, false, true) : { status: "error" }))
      .finally(() => window.clearTimeout(timeout));
    return () => { current = false; controller.abort(); window.clearTimeout(timeout); };
  }, [enabled, ownerId, key]);
  if (!enabled || !ownerId || !key) return { status: "idle", reload };
  if (result?.key === key) return { ...result.state, reload };
  const item = readTrainingAvailabilityCache(key);
  return item ? { ...ready(item.value, true), reload } : { status: "loading", reload };
}
