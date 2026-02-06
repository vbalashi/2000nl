"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type DevSessionResponse = {
  session?: { access_token: string; refresh_token: string };
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

      const { error } = await supabase.auth.setSession({
        access_token: json.session.access_token,
        refresh_token: json.session.refresh_token,
      });

      if (cancelled) return;

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("success");
      setMessage("Signed in. Redirecting...");
      router.replace(redirectTo);
      router.refresh();
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
        it via <code>supabase.auth.setSession()</code>.
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
