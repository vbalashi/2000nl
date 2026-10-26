"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/lib/supabaseClient";

type ClientMetadata = {
  clientId: string;
  displayName: string;
  clientType: string;
  redirectUri: string;
  scopes: Array<{ id: string; label: string }>;
  requiresPkce: boolean;
};

type PageState =
  | { status: "loading" }
  | { status: "login_required" }
  | { status: "ready"; user: User; metadata: ClientMetadata }
  | { status: "error"; message: string };

function queryValue(params: URLSearchParams, key: string) {
  const value = params.get(key);
  return value && value.trim() ? value.trim() : "";
}

function declineRedirect(redirectUri: string, state: string) {
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("error", "access_denied");
  if (state) redirect.searchParams.set("state", state);
  window.location.assign(redirect.href);
}

export default function ConnectAuthorizePage() {
  const [pageState, setPageState] = useState<PageState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const params = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const clientId = queryValue(params, "client_id");
  const redirectUri = queryValue(params, "redirect_uri");
  const scope = queryValue(params, "scope");
  const state = queryValue(params, "state");
  const responseType = queryValue(params, "response_type");
  const codeChallenge = queryValue(params, "code_challenge");
  const codeChallengeMethod = queryValue(params, "code_challenge_method") || "S256";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (responseType !== "code") {
        setPageState({ status: "error", message: "Unsupported response type." });
        return;
      }
      if (!clientId || !redirectUri || !scope || !codeChallenge) {
        setPageState({ status: "error", message: "The connect request is incomplete." });
        return;
      }

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      if (!user) {
        if (!cancelled) setPageState({ status: "login_required" });
        return;
      }

      const metadataUrl = new URL(`/api/connect/clients/${clientId}`, window.location.origin);
      metadataUrl.searchParams.set("redirect_uri", redirectUri);
      metadataUrl.searchParams.set("scope", scope);

      const response = await fetch(metadataUrl, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (!cancelled) {
          setPageState({
            status: "error",
            message:
              payload?.error === "redirect_uri_not_allowed"
                ? "This connected app is not registered for this redirect URL."
                : "This connected app cannot be authorized.",
          });
        }
        return;
      }

      if (!cancelled) {
        setPageState({ status: "ready", user, metadata: payload as ClientMetadata });
      }
    }

    load();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [clientId, codeChallenge, redirectUri, responseType, scope]);

  async function approve() {
    if (pageState.status !== "ready") return;
    setSubmitting(true);
    setSubmitError(null);

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      setPageState({ status: "login_required" });
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/connect/authorize/approve", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        redirectUri,
        scope,
        state,
        codeChallenge,
        codeChallengeMethod,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.redirectTo) {
      setSubmitError("Could not complete the connection request.");
      setSubmitting(false);
      return;
    }

    window.location.assign(payload.redirectTo);
  }

  if (pageState.status === "login_required") {
    return <AuthScreen />;
  }

  if (pageState.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background-light px-4 text-slate-900 dark:bg-background-dark dark:text-white">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">Laden...</p>
      </main>
    );
  }

  if (pageState.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background-light px-4 text-slate-900 dark:bg-background-dark dark:text-white">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm dark:border-red-900/60 dark:bg-slate-950">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            {pageState.message}
          </p>
        </div>
      </main>
    );
  }

  const { metadata, user } = pageState;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background-light px-4 py-8 text-slate-900 dark:bg-background-dark dark:text-white">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-6 flex items-center justify-between gap-4">
          <BrandLogo className="h-8 w-auto" />
          <div className="text-right text-xs text-slate-500 dark:text-slate-400">
            <div>{user.email}</div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase text-primary">
            2000NL Connect
          </p>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">
            Connect {metadata.displayName}
          </h1>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {metadata.displayName} wants access to your 2000NL account.
          </p>
        </div>

        <div className="mt-6 rounded-md border border-slate-200 dark:border-slate-800">
          {metadata.scopes.map((item) => (
            <div
              key={item.id}
              className="border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800"
            >
              <div className="font-semibold text-slate-900 dark:text-white">{item.label}</div>
              <div className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                {item.id}
              </div>
            </div>
          ))}
        </div>

        {submitError ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {submitError}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => declineRedirect(metadata.redirectUri, state)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </section>
    </main>
  );
}
