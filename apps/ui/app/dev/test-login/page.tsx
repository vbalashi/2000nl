"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DevSessionResponse = {
  // Supabase session (shape can evolve; treat as opaque).
  session?: any;
  error?: string;
};

export const dynamic = "force-dynamic";

export default function DevTestLoginPage() {
  const router = useRouter();

  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // This page exists to help local development and automation agents.
      if (process.env.NODE_ENV === "production") {
        setStatus("error");
        setMessage("Not available in production.");
        return;
      }

      setStatus("loading");
      setMessage("Creating a dev session...");

      // In React Strict Mode, effects can run twice in dev.
      // Make this helper idempotent within a tab: if we've already completed once,
      // just redirect.
      const markerKey = "__dev_test_login_done_v1";
      try {
        if (window.sessionStorage?.getItem(markerKey) === "1") {
          router.replace("/");
          router.refresh();
          return;
        }
      } catch {
        // ignore
      }

      const redirectTo =
        (typeof window !== "undefined"
          ? new URL(window.location.href).searchParams.get("redirectTo")
          : null) ?? "/";

      const res = await fetch("/api/dev/test-session", { cache: "no-store" });
      const json = (await res.json()) as DevSessionResponse;
      if (cancelled) return;

      if (!res.ok || json.error || !json.session) {
        setStatus("error");
        setMessage(json.error ?? "Failed to create a dev session.");
        return;
      }

      const resolveProjectRef = (supabaseUrl) => {
        try {
          const u = new URL(String(supabaseUrl || ""));
          const host = u.hostname || "";
          // Expected: <ref>.supabase.co
          const ref = host.split(".")[0];
          return ref || null;
        } catch {
          return null;
        }
      };

      const projectRef = resolveProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL) || "lliwdcpuuzjmxyzrjtoz";
      const storageKey = `sb-${projectRef}-auth-token`;
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith("sb-")) localStorage.removeItem(k);
        }
        localStorage.setItem(storageKey, JSON.stringify(json.session));
        window.sessionStorage?.setItem(markerKey, "1");
      } catch (err: any) {
        setStatus("error");
        setMessage(String(err?.message ?? err ?? "Failed to write localStorage."));
        return;
      }

      if (cancelled) return;

      setStatus("success");
      setMessage("Signed in. Redirecting...");
      // Use a hard navigation so the root page bootstraps with the stored session.
      window.location.replace(redirectTo);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Dev test login</h1>
      <p className="text-sm text-neutral-600">
        Uses a server-only Supabase Admin API call to mint an OTP for{" "}
        <code>TEST_USER_EMAIL</code>, then exchanges it for a session and stores
        the session JSON in <code>localStorage</code> (Supabase format).
      </p>

      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <div className="text-sm">
          <div className="font-medium">Status: {status}</div>
          {message ? <div className="mt-1 text-neutral-700">{message}</div> : null}
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Endpoint: <code>/api/dev/test-session</code>
      </p>
    </main>
  );
}
