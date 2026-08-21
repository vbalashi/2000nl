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
  type OnboardingLanguage,
} from "@/lib/onboardingI18n";
import {
  createTrainingTransitionId,
  measureTrainingTransitionStage,
} from "@/lib/training/trainingTransitionTiming";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<
    "loading" | "long-running" | "error" | "ready"
  >("loading");
  const [initialTransitionId] = useState(createTrainingTransitionId);
  const [interfaceLanguage, setInterfaceLanguage] =
    useState<OnboardingLanguage>("en");
  const initialAuthRequestStartedRef = useRef(false);

  const loadSession = useCallback((transitionId: string) => {
    setBootstrapStatus("loading");
    void measureTrainingTransitionStage(
      transitionId,
      "auth.session",
      () => supabase.auth.getSession(),
      ({ data }) => (data?.session?.user ? "authenticated" : "anonymous"),
    )
      .then(({ data }) => {
        setUser(data?.session?.user ?? null);
        setBootstrapStatus("ready");
      })
      .catch(() => {
        setBootstrapStatus("error");
      });
  }, []);

  useEffect(() => {
    setInterfaceLanguage(getOnboardingLanguage());
  }, []);

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
    if (!initialAuthRequestStartedRef.current) {
      initialAuthRequestStartedRef.current = true;
      loadSession(initialTransitionId);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [initialTransitionId, loadSession]);

  if (bootstrapStatus !== "ready") {
    return (
      <TrainingBootstrapShell
        interfaceLanguage={interfaceLanguage}
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
        user={user}
        initialTransitionId={initialTransitionId}
      />
    </>
  );
}
