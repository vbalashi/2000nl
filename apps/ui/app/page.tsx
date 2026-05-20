"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { TrainingScreen } from "@/components/training/TrainingScreen";
import { DevDatabaseWarning } from "@/components/DevDatabaseWarning";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.subscription.unsubscribe();
    };
  }, []);

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
      <TrainingScreen user={user} />
    </>
  );
}
