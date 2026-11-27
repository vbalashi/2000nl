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
  const [checkedAccount, setCheckedAccount] = useState<string | null>(null);
  const [refreshCheck, setRefreshCheck] = useState(0);
  const [checkFailed, setCheckFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) { setAccepted(null); setCheckedAccount(null); }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const accountId = user?.id;
  const acceptedHere = Boolean(accountId && (hasAcceptedTerms(user?.app_metadata) || accepted === accountId));
  // An existing tab can still hold the session from before acceptance on another device.
  useEffect(() => {
    if (!accountId || acceptedHere) return;
    let active = true;
    async function verify() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || data.user?.id !== accountId) throw new Error();
        if (hasAcceptedTerms(data.user.app_metadata)) setAccepted(data.user.id);
        setCheckedAccount(data.user.id);
        setCheckFailed(false);
      } catch {
        if (active) setCheckFailed(true);
      }
    }
    void verify();
    window.addEventListener("focus", verify);
    return () => {
      active = false;
      window.removeEventListener("focus", verify);
    };
  }, [accountId, acceptedHere, refreshCheck]);
  if (user === undefined) return <main aria-busy="true" aria-label={copy.loading} />;
  if (!user) return <AuthScreen />;
  if (acceptedHere) return children;
  if (checkedAccount !== user.id) {
    return checkFailed
      ? <main className="mx-auto max-w-lg px-6 py-12"><button className="underline" onClick={() => { setCheckFailed(false); setRefreshCheck(value => value + 1); }}>{copy.retry}</button></main>
      : <main aria-busy="true" aria-label={copy.loading} />;
  }

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
