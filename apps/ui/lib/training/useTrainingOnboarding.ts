import { useCallback, useEffect, useState } from "react";
import type { CallBackProps } from "react-joyride";
import { STATUS } from "react-joyride";
import { trainingDebug } from "@/lib/trainingDebug";
import {
  detectOnboardingLanguage,
  getOnboardingLanguage,
  setOnboardingLanguage,
  type OnboardingLanguage,
} from "@/lib/onboardingI18n";
import { fetchUserPreferences, updateUserPreferences } from "../trainingService";

async function updateOnboardingPreferences(
  userId: string,
  patch: Record<string, any>,
) {
  const prefs = await fetchUserPreferences(userId);
  const preferences = prefs.preferences ?? {};
  await updateUserPreferences({
    userId,
    preferences: {
      ...preferences,
      ...patch,
    },
  });
}

export function useTrainingOnboarding(params: {
  userId?: string;
  translationLang: string | null;
}) {
  const { userId, translationLang } = params;
  const [runTour, setRunTour] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showLanguageSelection, setShowLanguageSelection] = useState(false);
  const [onboardingLang, setOnboardingLang] =
    useState<OnboardingLanguage>("en");
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const loadOnboardingPrefs = async () => {
      try {
        const prefs = await fetchUserPreferences(userId);
        const preferences = prefs.preferences ?? {};
        const { onboardingCompleted, onboardingLanguage } = preferences;

        setOnboardingCompleted(Boolean(onboardingCompleted));

        if (!onboardingLanguage) {
          const detected = detectOnboardingLanguage(translationLang);
          setOnboardingLang(detected);
          await updateOnboardingPreferences(userId, {
            onboardingLanguage: detected,
          });
        } else {
          setOnboardingLang(onboardingLanguage as OnboardingLanguage);
        }
      } catch (e) {
        console.error("[Onboarding] Failed to load preferences:", e);
      }
    };

    void loadOnboardingPrefs();
  }, [translationLang, userId]);

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

  const handleLanguageSelect = useCallback(
    async (lang: OnboardingLanguage) => {
      setOnboardingLanguageChoice(lang);
      setShowLanguageSelection(false);

      if (userId) {
        try {
          await updateOnboardingPreferences(userId, {
            onboardingLanguage: lang,
          });
        } catch (e) {
          console.error("[Onboarding] Failed to save language:", e);
        }
      }

      setRunTour(true);
    },
    [setOnboardingLanguageChoice, userId],
  );

  const startOnboarding = useCallback(() => {
    setOnboardingCompleted(false);

    if (userId) {
      void updateOnboardingPreferences(userId, {
        onboardingCompleted: false,
      }).catch((e) => {
        console.error("[Onboarding] Failed to reset completion:", e);
      });
    }

    setRunTour(true);
  }, [userId]);

  const handleJoyrideCallback = useCallback(
    async (data: CallBackProps) => {
      const { status } = data;
      const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

      if (finishedStatuses.includes(status) && userId) {
        setRunTour(false);
        setOnboardingCompleted(true);

        try {
          await updateOnboardingPreferences(userId, {
            onboardingCompleted: true,
          });
          trainingDebug.log("[Onboarding] Marked as completed in DB");
        } catch (e) {
          console.error("[Onboarding] Failed to save completion:", e);
        }
      }
    },
    [userId],
  );

  return {
    handleJoyrideCallback,
    handleLanguageSelect,
    isDarkMode,
    onboardingCompleted,
    onboardingLang,
    runTour,
    setOnboardingLanguageChoice,
    setShowLanguageSelection,
    showLanguageSelection,
    startOnboarding,
  };
}

export { getOnboardingLanguage };
