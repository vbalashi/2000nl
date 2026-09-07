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
  const initialTransitionIdRef = useRef(initialTransitionId);
  const initialPreferencesRef = useRef(initialPreferences);

  useEffect(() => {
    if (!userId) return;
    if (initialPreferencesRef.current) {
      initialPreferencesRef.current = undefined;
      initialTransitionIdRef.current = undefined;
      return;
    }

    const loadPreferences = async () => {
      const transitionId = initialTransitionIdRef.current;
      initialTransitionIdRef.current = undefined;
      const prefs = transitionId
        ? await measureTrainingTransitionStage(
            transitionId,
            "training.preferences",
            () => fetchUserPreferences(userId),
          )
        : await fetchUserPreferences(userId);
      trainingDebug.log("[Settings] Loaded preferences from Supabase:", prefs);
      setThemePreference(prefs.themePreference);
      setAudioQualityState(prefs.audioQuality);
      setEnabledModesState(prefs.modesEnabled);
      setCardFilterState(prefs.cardFilter);
      setLanguageState(prefs.languageCode);
      setNewReviewRatioState(prefs.newReviewRatio);
      setActiveScenarioState(prefs.activeScenario);
      setTranslationLangState(prefs.translationLang);
    };

    void loadPreferences();
  }, [userId]);

  const setEnabledModes = useCallback(
    (newModes: TrainingMode[], options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving modes to Supabase:", newModes);
      setEnabledModesState(newModes);
      if (userId && options.persist !== false) {
        void updateUserPreferences({ userId, modesEnabled: newModes });
      }
    },
    [userId],
  );

  const setCardFilter = useCallback(
    (newFilter: CardFilter, options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving card filter to Supabase:", newFilter);
      setCardFilterState(newFilter);
      if (userId && options.persist !== false) {
        void updateUserPreferences({ userId, cardFilter: newFilter });
      }
    },
    [userId],
  );

  const setLanguage = useCallback(
    (newLanguage: string) => {
      trainingDebug.log("[Settings] Saving language to Supabase:", newLanguage);
      setLanguageState(newLanguage);
      if (userId) {
        void updateUserPreferences({
          userId,
          languageCode: newLanguage,
        });
      }
    },
    [userId],
  );

  const setTheme = useCallback(
    (newTheme: ThemePreference) => {
      trainingDebug.log("[Settings] Saving theme to Supabase:", newTheme);
      setThemePreference(newTheme);
      if (userId) {
        void updateUserPreferences({
          userId,
          themePreference: newTheme,
        });
      }
    },
    [userId],
  );

  const setAudioQuality = useCallback(
    (quality: AudioQuality) => {
      trainingDebug.log("[Settings] Saving audio quality to Supabase:", quality);
      setAudioQualityState(quality);
      if (userId) {
        void updateUserPreferences({
          userId,
          audioQuality: quality,
        });
      }
    },
    [userId],
  );

  const setNewReviewRatio = useCallback(
    (newRatio: number, options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving new/review ratio to Supabase:", newRatio);
      setNewReviewRatioState(newRatio);
      if (userId && options.persist !== false) {
        void updateUserPreferences({
          userId,
          newReviewRatio: newRatio,
        });
      }
    },
    [userId],
  );

  const setTranslationLang = useCallback(
    (newLang: string | null) => {
      trainingDebug.log(
        "[Settings] Saving translation language to Supabase:",
        newLang,
      );
      setTranslationLangState(newLang);
      if (userId) {
        void updateUserPreferences({
          userId,
          translationLang: newLang,
        });
      }
    },
    [userId],
  );

  const setActiveScenario = useCallback(
    (newScenario: string, options: PersistOptions = {}) => {
      trainingDebug.log(
        "[Settings] Saving active scenario to Supabase:",
        newScenario,
      );
      setActiveScenarioState(newScenario);
      if (userId && options.persist !== false) {
        void updateUserPreferences({
          userId,
          activeScenario: newScenario,
        });
      }
    },
    [userId],
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
    setActiveScenario,
    setAudioQuality,
    setCardFilter,
    setEnabledModes,
    setLanguage,
    setNewReviewRatio,
    setTheme,
    setTranslationLang,
  };
}
