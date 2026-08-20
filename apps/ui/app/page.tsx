"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { TrainingLibraryShell } from "@/components/navigation/TrainingLibraryShell";
import { DevDatabaseWarning } from "@/components/DevDatabaseWarning";
import {
  createTrainingTransitionId,
  measureTrainingTransitionStage,
} from "@/lib/training/trainingTransitionTiming";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialTransitionId] = useState(createTrainingTransitionId);
  const initialAuthRequestStartedRef = useRef(false);

  useEffect(() => {
    if (!initialAuthRequestStartedRef.current) {
      initialAuthRequestStartedRef.current = true;
      void measureTrainingTransitionStage(
        initialTransitionId,
        "auth.session",
        () => supabase.auth.getSession(),
        ({ data }) => (data?.session?.user ? "authenticated" : "anonymous"),
      ).then(({ data }) => {
        setUser(data?.session?.user ?? null);
        setLoading(false);
      });
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, [initialTransitionId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-light text-slate-900 dark:bg-background-dark dark:text-white">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">Laden…</p>
      </div>
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
