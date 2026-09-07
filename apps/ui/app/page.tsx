"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { TrainingLibraryShell } from "@/components/navigation/TrainingLibraryShell";
import { DevDatabaseWarning } from "@/components/DevDatabaseWarning";
import { TrainingBootstrapShell } from "@/components/training/pilot/TrainingBootstrapShell";
import {
  getOnboardingLanguage,
  getStoredOnboardingLanguage,
  setOnboardingLanguage,
  type OnboardingLanguage,
} from "@/lib/onboardingI18n";
import {
  fetchUserPreferences,
  type UserPreferences,
} from "@/lib/trainingService";
import {
  createTrainingTransitionId,
  measureTrainingTransitionStage,
  recordTrainingTransitionTiming,
} from "@/lib/training/trainingTransitionTiming";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<
    "loading" | "long-running" | "error" | "ready"
  >("loading");
  const [initialTransitionId] = useState(createTrainingTransitionId);
  const [interfaceLanguage, setInterfaceLanguage] =
    useState<OnboardingLanguage>("en");
  const [interfaceLanguageReady, setInterfaceLanguageReady] = useState(false);
  const [browserLanguageResolved, setBrowserLanguageResolved] = useState(false);
  const [initialPreferences, setInitialPreferences] =
    useState<UserPreferences | null>(null);
  const initialAuthRequestStartedRef = useRef(false);
  const bootstrapReadyRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  const loadSession = useCallback((transitionId: string) => {
    bootstrapReadyRef.current = false;
    setBootstrapStatus("loading");
    void measureTrainingTransitionStage(
      transitionId,
      "auth.session",
      () => supabase.auth.getSession(),
      ({ data }) => (data?.session?.user ? "authenticated" : "anonymous"),
    )
      .then(async ({ data }) => {
        const authenticatedUser = data?.session?.user ?? null;
        if (!authenticatedUser) {
          currentUserIdRef.current = null;
          setUser(null);
          setInitialPreferences(null);
          bootstrapReadyRef.current = true;
          setBootstrapStatus("ready");
          return;
        }

        const browserLanguage = getStoredOnboardingLanguage();
        const preferences = await measureTrainingTransitionStage(
          transitionId,
          "training.preferences",
          () => fetchUserPreferences(authenticatedUser.id),
        );
        const accountLanguage = preferences.preferences.onboardingLanguage;
        const resolvedLanguage = browserLanguage ?? accountLanguage ?? "en";
        setOnboardingLanguage(resolvedLanguage);
        setInterfaceLanguage(resolvedLanguage);
        setInterfaceLanguageReady(true);
        setInitialPreferences(preferences);
        currentUserIdRef.current = authenticatedUser.id;
        setUser(authenticatedUser);
        bootstrapReadyRef.current = true;
        setBootstrapStatus("ready");
      })
      .catch(() => {
        setBootstrapStatus("error");
      });
  }, []);

  useEffect(() => {
    const storedLanguage = getStoredOnboardingLanguage();
    const initialLanguage = storedLanguage ?? getOnboardingLanguage();
    setInterfaceLanguage(initialLanguage);
    setInterfaceLanguageReady(Boolean(storedLanguage));
    setBrowserLanguageResolved(true);
    recordTrainingTransitionTiming({
      transitionId: initialTransitionId,
      stage: "training.interface-language",
      durationMs: 0,
      outcome: storedLanguage ? `local-${storedLanguage}` : "local-missing",
    });
  }, [initialTransitionId]);

  useEffect(() => {
    if (bootstrapStatus !== "loading") return;
    const timeout = window.setTimeout(() => {
      setBootstrapStatus((current) =>
        current === "loading" ? "long-running" : current,
      );
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [bootstrapStatus]);

  useEffect(() => {
    if (!browserLanguageResolved) return;
    if (!initialAuthRequestStartedRef.current) {
      initialAuthRequestStartedRef.current = true;
      loadSession(initialTransitionId);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_, session) => {
      if (!bootstrapReadyRef.current) return;
      const nextUserId = session?.user?.id ?? null;
      if (nextUserId === currentUserIdRef.current) return;
      loadSession(createTrainingTransitionId());
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [browserLanguageResolved, initialTransitionId, loadSession]);

  if (bootstrapStatus !== "ready") {
    return (
      <TrainingBootstrapShell
        interfaceLanguage={interfaceLanguage}
        interfaceLanguageReady={interfaceLanguageReady}
        status={bootstrapStatus}
        onRetry={() => loadSession(createTrainingTransitionId())}
      />
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <>
      <DevDatabaseWarning />
      <TrainingLibraryShell
        key={user.id}
        user={user}
        initialTransitionId={initialTransitionId}
        initialInterfaceLanguage={interfaceLanguage}
        initialPreferences={initialPreferences ?? undefined}
      />
    </>
  );
}
