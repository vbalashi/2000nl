import { useUserEventHints } from "@/lib/events/userEventHints";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioQuality } from "@/lib/audio/types";
import { trainingDebug } from "@/lib/trainingDebug";
import type { CardFilter, TrainingMode } from "@/lib/types";
import {
  fetchUserPreferences,
  updateUserPreferences,
  type UserPreferences,
} from "../trainingService";
import { measureTrainingTransitionStage } from "./trainingTransitionTiming";

export type ThemePreference = "light" | "dark" | "system";
type PersistOptions = { persist?: boolean };

export function useTrainingPreferences(
  userId?: string,
  initialTransitionId?: string,
  initialPreferences?: UserPreferences,
) {
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(initialPreferences?.themePreference ?? "system");
  const [audioQuality, setAudioQualityState] = useState<AudioQuality>(
    initialPreferences?.audioQuality ??
      ((process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT as AudioQuality) ||
        "free"),
  );
  const [enabledModes, setEnabledModesState] = useState<TrainingMode[]>(
    initialPreferences?.modesEnabled ?? ["word-to-definition"],
  );
  const [cardFilter, setCardFilterState] = useState<CardFilter>(
    initialPreferences?.cardFilter ?? "both",
  );
  const [language, setLanguageState] = useState(
    initialPreferences?.languageCode ?? "nl",
  );
  const [newReviewRatio, setNewReviewRatioState] = useState(
    initialPreferences?.newReviewRatio ?? 2,
  );
  const [activeScenario, setActiveScenarioState] =
    useState<string>(initialPreferences?.activeScenario ?? "understanding");
  const [translationLang, setTranslationLangState] = useState<string | null>(
    initialPreferences?.translationLang ?? null,
  );
  const translationLangRef = useRef(translationLang);
  translationLangRef.current = translationLang;
  const [secondaryTranslationLang, setSecondaryTranslationLangState] = useState<string | null>(initialPreferences?.translationLang && initialPreferences.translationLang !== "off" ? initialPreferences.secondaryTranslationLang ?? null : null);
  const initialTransitionIdRef = useRef(initialTransitionId);
  const initialPreferencesRef = useRef(initialPreferences);

  const readGeneration = useRef(0);
  const pendingWrites = useRef(0);
  const invalidateReads = useCallback(() => ++readGeneration.current, []);
  const applyPreferences = useCallback((prefs: UserPreferences) => {
      setThemePreference(prefs.themePreference);
      setAudioQualityState(prefs.audioQuality);
      setEnabledModesState(prefs.modesEnabled);
      setCardFilterState(prefs.cardFilter);
      setLanguageState(prefs.languageCode);
      setNewReviewRatioState(prefs.newReviewRatio);
      setActiveScenarioState(prefs.activeScenario);
      setTranslationLangState(prefs.translationLang);
      translationLangRef.current = prefs.translationLang;
      setSecondaryTranslationLangState(prefs.translationLang && prefs.translationLang !== "off" ? prefs.secondaryTranslationLang ?? null : null);
  }, []);
  const refreshPreferences = useCallback(async () => {
    if (!userId || pendingWrites.current) return;
    const generation = ++readGeneration.current;
    const prefs = await fetchUserPreferences(userId);
    if (generation === readGeneration.current && !pendingWrites.current) applyPreferences(prefs);
  }, [userId, applyPreferences]);
  const flushHints = useUserEventHints(userId, ["account.changed"], refreshPreferences, () => pendingWrites.current > 0);
  const persistPreferences = useCallback((input: Parameters<typeof updateUserPreferences>[0]) => {
    readGeneration.current++;
    pendingWrites.current++;
    return updateUserPreferences(input).finally(() => { pendingWrites.current--; flushHints(); });
  }, [flushHints]);
  useEffect(() => {
    if (!userId) return;
    const generation = ++readGeneration.current;
    if (initialPreferencesRef.current) {
      initialPreferencesRef.current = undefined;
      initialTransitionIdRef.current = undefined;
      return () => { invalidateReads(); };
    }
    const transitionId = initialTransitionIdRef.current;
    initialTransitionIdRef.current = undefined;
    const request = transitionId
      ? measureTrainingTransitionStage(transitionId, "training.preferences", () => fetchUserPreferences(userId))
      : fetchUserPreferences(userId);
    void request.then(prefs => {
      if (generation === readGeneration.current && !pendingWrites.current) applyPreferences(prefs);
    }).catch(() => { /* Existing settings remain available on a failed read. */ });
    return () => { invalidateReads(); };
  }, [userId, applyPreferences, invalidateReads]);

  const setEnabledModes = useCallback(
    (newModes: TrainingMode[], options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving modes to Supabase:", newModes);
      setEnabledModesState(newModes);
      if (userId && options.persist !== false) {
        void persistPreferences({ userId, modesEnabled: newModes });
      }
    },
    [userId, persistPreferences],
  );

  const setCardFilter = useCallback(
    (newFilter: CardFilter, options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving card filter to Supabase:", newFilter);
      setCardFilterState(newFilter);
      if (userId && options.persist !== false) {
        void persistPreferences({ userId, cardFilter: newFilter });
      }
    },
    [userId, persistPreferences],
  );

  const setLanguage = useCallback(
    (newLanguage: string) => {
      trainingDebug.log("[Settings] Saving language to Supabase:", newLanguage);
      setLanguageState(newLanguage);
      if (userId) {
        void persistPreferences({
          userId,
          languageCode: newLanguage,
        });
      }
    },
    [userId, persistPreferences],
  );

  const setTheme = useCallback(
    (newTheme: ThemePreference) => {
      trainingDebug.log("[Settings] Saving theme to Supabase:", newTheme);
      setThemePreference(newTheme);
      if (userId) {
        void persistPreferences({
          userId,
          themePreference: newTheme,
        });
      }
    },
    [userId, persistPreferences],
  );

  const setAudioQuality = useCallback(
    (quality: AudioQuality) => {
      trainingDebug.log("[Settings] Saving audio quality to Supabase:", quality);
      setAudioQualityState(quality);
      if (userId) {
        void persistPreferences({
          userId,
          audioQuality: quality,
        });
      }
    },
    [userId, persistPreferences],
  );

  const setNewReviewRatio = useCallback(
    (newRatio: number, options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving new/review ratio to Supabase:", newRatio);
      setNewReviewRatioState(newRatio);
      if (userId && options.persist !== false) {
        void persistPreferences({
          userId,
          newReviewRatio: newRatio,
        });
      }
    },
    [userId, persistPreferences],
  );

  const setTranslationLang = useCallback(
    (newLang: string | null) => {
      trainingDebug.log(
        "[Settings] Saving translation language to Supabase:",
        newLang,
      );
      setTranslationLangState(newLang);
      translationLangRef.current = newLang;
      const disabled = !newLang || newLang === "off";
      if (disabled) setSecondaryTranslationLangState(null);
      if (userId) {
        void persistPreferences({
          userId,
          translationLang: newLang,
          secondaryTranslationLang: disabled ? null : secondaryTranslationLang,
        });
      }
    },
    [userId, secondaryTranslationLang, persistPreferences],
  );

  const setSecondaryTranslationLang = useCallback((newLang: string | null) => {
    if (!translationLangRef.current || translationLangRef.current === "off") return;
    setSecondaryTranslationLangState(newLang);
    if (userId) void persistPreferences({ userId, secondaryTranslationLang: newLang });
  }, [userId, persistPreferences]);

  const setActiveScenario = useCallback(
    (newScenario: string, options: PersistOptions = {}) => {
      trainingDebug.log(
        "[Settings] Saving active scenario to Supabase:",
        newScenario,
      );
      setActiveScenarioState(newScenario);
      if (userId && options.persist !== false) {
        void persistPreferences({
          userId,
          activeScenario: newScenario,
        });
      }
    },
    [userId, persistPreferences],
  );

  return {
    activeScenario,
    audioQuality,
    cardFilter,
    enabledModes,
    language,
    newReviewRatio,
    themePreference,
    translationLang,
    secondaryTranslationLang,
    setActiveScenario,
    setAudioQuality,
    setCardFilter,
    setEnabledModes,
    setLanguage,
    setNewReviewRatio,
    setTheme,
    setTranslationLang,
    setSecondaryTranslationLang,
  };
}
