"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BrandLogo } from "@/components/BrandLogo";

type AuthMode = "signin" | "signup" | "reset";

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    if (mode === "reset") {
      // Password reset flow
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        setMessageType("error");
        setMessage(error.message);
      } else {
        setMessageType("success");
        setMessage("Check your email for a password reset link!");
      }
    } else {
      // Sign in or sign up flow
      const payload =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (payload.error) {
        setMessageType("error");
        setMessage(payload.error.message);
      } else {
        setMessageType("success");
        setMessage("Check your inbox for a confirmation link if needed.");
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-white/90 px-8 py-10 shadow-xl shadow-slate-900/10 backdrop-blur dark:bg-slate-900/70">
        <div>
          <div className="flex justify-center">
            <BrandLogo className="text-4xl leading-none font-black tracking-tight text-slate-900 dark:text-white opacity-80 dark:opacity-85" />
          </div>
          <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            Log in om te beginnen met het leren van de 2000 meest voorkomende
            Nederlandse woorden.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            E-mailadres
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
          {mode !== "reset" && (
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Wachtwoord
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
          )}
          {message && (
            <p
              className={`text-sm text-center ${
                messageType === "success"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:opacity-60"
          >
            {mode === "signin"
              ? "Inloggen"
              : mode === "signup"
              ? "Aanmelden"
              : "Reset Link Versturen"}
          </button>
        </form>
        <div className="space-y-2 text-center text-sm text-slate-500 dark:text-slate-400">
          {mode !== "reset" && (
            <button
              type="button"
              onClick={() => setMode("reset")}
              className="block w-full font-semibold text-primary hover:underline"
            >
              Wachtwoord vergeten?
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-semibold text-primary hover:underline"
          >
            {mode === "signin"
              ? "Nog geen account? Maak er een aan"
              : mode === "signup"
              ? "Al een account? Log in"
              : "Terug naar inloggen"}
          </button>
        </div>
      </div>
    </div>
  );
}
