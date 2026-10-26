"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const handleCallback = async () => {
      let destination = "/?error=auth_failed";
      try {
        const params = new URLSearchParams(window.location.search);
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        if (!params.has("error") && !fragment.has("error")) {
          // detectSessionInUrl owns the one-time PKCE exchange. Wait for that
          // same initialization instead of consuming the code/verifier twice.
          const initialized = await supabase.auth.initialize();
          if (!initialized.error) {
            const { data, error } = await supabase.auth.getSession();
            if (!error && data.session) destination = "/";
          }
        }
      } catch {
        // Keep provider details and credentials out of URLs and console logs.
      }
      if (active) router.replace(destination);
    };
    void handleCallback();
    return () => { active = false; };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-slate-600 dark:text-slate-400">Inloggen...</p>
      </div>
    </div>
  );
}
