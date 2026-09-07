"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { TrainingLibraryShell } from "@/components/navigation/TrainingLibraryShell";
import { DevDatabaseWarning } from "@/components/DevDatabaseWarning";
import { TrainingBootstrapShell } from "@/components/training/pilot/TrainingBootstrapShell";
import {
  detectOnboardingLanguage,
  getStoredOnboardingLanguage,
  isOnboardingLanguage,
  setOnboardingLanguage,
  type OnboardingLanguage,
} from "@/lib/onboardingI18n";
import { fetchUserPreferences } from "@/lib/trainingService";
import {
  createTrainingTransitionId,
  measureTrainingTransitionStage,
  recordTrainingTransitionTiming,
} from "@/lib/training/trainingTransitionTiming";
import type { TrainingStartupSnapshot } from "@/lib/training/trainingStartupSnapshot";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<
    "loading" | "long-running" | "error" | "ready"
  >("loading");
  const [activeTransitionId, setActiveTransitionId] = useState(
    createTrainingTransitionId,
  );
  const [interfaceLanguage, setInterfaceLanguage] =
    useState<OnboardingLanguage>("en");
  const [interfaceLanguageReady, setInterfaceLanguageReady] = useState(false);
  const [browserLanguageResolved, setBrowserLanguageResolved] = useState(false);
  const [startupSnapshot, setStartupSnapshot] =
    useState<TrainingStartupSnapshot | null>(null);
  const initialTransitionIdRef = useRef(activeTransitionId);
  const initialAuthRequestStartedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const requestedUserIdRef = useRef<string | null | undefined>(undefined);
  const bootstrapRequestRef = useRef(0);

  const loadSession = useCallback((transitionId: string) => {
    const requestId = bootstrapRequestRef.current + 1;
    bootstrapRequestRef.current = requestId;
    requestedUserIdRef.current = undefined;
    setActiveTransitionId(transitionId);
    setBootstrapStatus("loading");
    void measureTrainingTransitionStage(
      transitionId,
      "auth.session",
      () => supabase.auth.getSession(),
      ({ data }) => (data?.session?.user ? "authenticated" : "anonymous"),
    )
      .then(async ({ data }) => {
        if (bootstrapRequestRef.current !== requestId) return;
        const authenticatedUser = data?.session?.user ?? null;
        requestedUserIdRef.current = authenticatedUser?.id ?? null;
        if (!authenticatedUser) {
          currentUserIdRef.current = null;
          setUser(null);
          setStartupSnapshot(null);
          setBootstrapStatus("ready");
          return;
        }

        const browserLanguage = getStoredOnboardingLanguage();
        const preferences = await measureTrainingTransitionStage(
          transitionId,
          "training.preferences",
          () => fetchUserPreferences(authenticatedUser.id),
        );
        if (bootstrapRequestRef.current !== requestId) return;
        const rawAccountLanguage = preferences.preferences.onboardingLanguage;
        const accountLanguage = isOnboardingLanguage(rawAccountLanguage)
          ? rawAccountLanguage
          : null;
        const resolvedLanguage =
          accountLanguage ??
          browserLanguage ??
          detectOnboardingLanguage(preferences.translationLang);
        setOnboardingLanguage(resolvedLanguage);
        setInterfaceLanguage(resolvedLanguage);
        setInterfaceLanguageReady(true);
        setStartupSnapshot({
          transitionId,
          interfaceLanguage: resolvedLanguage,
          preferences,
        });
        currentUserIdRef.current = authenticatedUser.id;
        setUser(authenticatedUser);
        setBootstrapStatus("ready");
      })
      .catch(() => {
        if (bootstrapRequestRef.current !== requestId) return;
        setBootstrapStatus("error");
      });
  }, []);

  useEffect(() => {
    const storedLanguage = getStoredOnboardingLanguage();
    const initialLanguage = storedLanguage ?? detectOnboardingLanguage();
    setInterfaceLanguage(initialLanguage);
    setInterfaceLanguageReady(Boolean(storedLanguage));
    setBrowserLanguageResolved(true);
    recordTrainingTransitionTiming({
      transitionId: activeTransitionId,
      stage: "training.interface-language",
      durationMs: 0,
      outcome: storedLanguage ? `local-${storedLanguage}` : "local-missing",
    });
  }, [activeTransitionId]);

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
      loadSession(initialTransitionIdRef.current);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      // getSession() above owns the initial read. Supabase also emits the same
      // state when the listener is registered; treating that as a change would
      // duplicate or repeatedly restart bootstrap.
      if (event === "INITIAL_SESSION") return;
      const nextUserId = session?.user?.id ?? null;
      if (requestedUserIdRef.current === undefined) {
        loadSession(createTrainingTransitionId());
        return;
      }
      const knownUserId =
        requestedUserIdRef.current ?? currentUserIdRef.current;
      if (nextUserId === knownUserId) return;
      loadSession(createTrainingTransitionId());
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [browserLanguageResolved, loadSession]);

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

  if (!user || !startupSnapshot) {
    return <AuthScreen />;
  }

  return (
    <>
      <DevDatabaseWarning />
      <TrainingLibraryShell
        key={user.id}
        user={user}
        startupSnapshot={startupSnapshot}
      />
    </>
  );
}
