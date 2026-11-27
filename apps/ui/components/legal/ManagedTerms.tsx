"use client";

import { useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import { hasAcceptedTerms, serviceTermsVersion } from "@/lib/legal/serviceTerms";
import { AuthScreen } from "@/components/auth/AuthScreen";

import { LegalLinks, Managed, useTermsCopy } from "./LegalLinks";

function AccountTerms({ children }: { children: ReactNode }) {
  const copy = useTermsCopy();
  const [user, setUser] = useState<User | null>();
  const [accepted, setAccepted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) setAccepted(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (user === undefined) return <main aria-busy="true" aria-label={copy.loading} />;
  if (!user) return <AuthScreen />;
  if (hasAcceptedTerms(user.app_metadata) || accepted === user.id) return children;

  async function accept(account: User) {
    setBusy(true);
    setError(false);
    try {
      const headers = await authenticatedJsonHeaders(account.id);
      const response = await fetch("/api/legal/acceptance", {
        method: "POST", headers, body: JSON.stringify({ version: serviceTermsVersion }),
      });
      if (!response.ok || (await response.json()).userId !== account.id) throw new Error();
      setAccepted(account.id);
      await supabase.auth.refreshSession();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-lg space-y-5 px-6 py-12">
    <h1 className="text-2xl font-bold">{copy.welcome}</h1>
    <p>{copy.explanation}</p>
    <LegalLinks />
    {error && <p role="alert">{copy.error}</p>}
    <button disabled={busy} className="rounded bg-primary px-4 py-2 font-semibold text-white" onClick={() => void accept(user)}>{copy.accept}</button>
    <button className="block underline" onClick={() => void supabase.auth.signOut()}>{copy.signOut}</button>
  </main>;
}

export function ManagedTerms({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <Managed.Provider value={enabled}>{children}</Managed.Provider>;
}

export function TermsGate({ children }: { children: ReactNode }) {
  return useContext(Managed) ? <AccountTerms>{children}</AccountTerms> : children;
}
