import { useCallback, useEffect, useRef, useState } from "react";
import type { CallBackProps } from "react-joyride";
import { STATUS } from "react-joyride";
import { trainingDebug } from "@/lib/trainingDebug";
import {
  detectOnboardingLanguage,
  getOnboardingLanguage,
  setOnboardingLanguage,
  type OnboardingLanguage,
} from "@/lib/onboardingI18n";
import { updateUserPreferences } from "../trainingService";

export function useTrainingOnboarding(params: {
  userId?: string;
  translationLang: string | null;
  initialInterfaceLanguage?: OnboardingLanguage;
  initialPreferences?: Record<string, any>;
}) {
  const {
    userId,
    translationLang,
    initialInterfaceLanguage,
    initialPreferences = {},
  } = params;
  const initialLanguage =
    initialInterfaceLanguage ??
    initialPreferences.onboardingLanguage ??
    getOnboardingLanguage();
  const [runTour, setRunTour] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showLanguageSelection, setShowLanguageSelection] = useState(false);
  const [onboardingLang, setOnboardingLang] =
    useState<OnboardingLanguage>(initialLanguage);
  const [onboardingCompleted, setOnboardingCompleted] = useState(
    Boolean(initialPreferences.onboardingCompleted),
  );
  const preferencesRef = useRef<Record<string, any>>(initialPreferences);
  const initializedUserRef = useRef<string | undefined>();

  const updateOnboardingPreferences = useCallback(
    async (patch: Record<string, any>) => {
      if (!userId) return;
      const preferences = {
        ...preferencesRef.current,
        ...patch,
      };
      preferencesRef.current = preferences;
      await updateUserPreferences({ userId, preferences });
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) return;
    if (initializedUserRef.current === userId) return;
    initializedUserRef.current = userId;

    const savedLanguage = initialPreferences.onboardingLanguage as
      | OnboardingLanguage
      | undefined;
    if (savedLanguage) {
      setOnboardingLanguage(savedLanguage);
      return;
    }

    const resolvedLanguage =
      initialInterfaceLanguage ?? detectOnboardingLanguage(translationLang);
    setOnboardingLang(resolvedLanguage);
    setOnboardingLanguage(resolvedLanguage);
    void updateOnboardingPreferences({
      onboardingLanguage: resolvedLanguage,
    }).catch((e) => {
      console.error("[Onboarding] Failed to save detected language:", e);
    });
  }, [
    initialInterfaceLanguage,
    initialPreferences.onboardingLanguage,
    translationLang,
    updateOnboardingPreferences,
    userId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };

    updateDarkMode();

    const observer = new MutationObserver(updateDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const setOnboardingLanguageChoice = useCallback(
    (lang: OnboardingLanguage) => {
      setOnboardingLang(lang);
      setOnboardingLanguage(lang);
    },
    [],
  );

  const saveOnboardingLanguageChoice = useCallback(
    async (lang: OnboardingLanguage) => {
      setOnboardingLanguageChoice(lang);

      if (userId) {
        try {
          await updateOnboardingPreferences({
            onboardingLanguage: lang,
          });
        } catch (e) {
          console.error("[Onboarding] Failed to save language:", e);
        }
      }
    },
    [setOnboardingLanguageChoice, updateOnboardingPreferences, userId],
  );

  const handleLanguageSelect = useCallback(
    async (lang: OnboardingLanguage) => {
      await saveOnboardingLanguageChoice(lang);
      setShowLanguageSelection(false);

      setRunTour(true);
    },
    [saveOnboardingLanguageChoice],
  );

  const startOnboarding = useCallback(() => {
    setOnboardingCompleted(false);

    if (userId) {
      void updateOnboardingPreferences({
        onboardingCompleted: false,
      }).catch((e) => {
        console.error("[Onboarding] Failed to reset completion:", e);
      });
    }

    setRunTour(true);
  }, [updateOnboardingPreferences, userId]);

  const handleJoyrideCallback = useCallback(
    async (data: CallBackProps) => {
      const { status } = data;
      const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

      if (finishedStatuses.includes(status) && userId) {
        setRunTour(false);
        setOnboardingCompleted(true);

        try {
          await updateOnboardingPreferences({
            onboardingCompleted: true,
          });
          trainingDebug.log("[Onboarding] Marked as completed in DB");
        } catch (e) {
          console.error("[Onboarding] Failed to save completion:", e);
        }
      }
    },
    [updateOnboardingPreferences, userId],
  );

  return {
    handleJoyrideCallback,
    handleLanguageSelect,
    isDarkMode,
    onboardingCompleted,
    onboardingLang,
    runTour,
    saveOnboardingLanguageChoice,
    setOnboardingLanguageChoice,
    setShowLanguageSelection,
    showLanguageSelection,
    startOnboarding,
  };
}

export { getOnboardingLanguage };
