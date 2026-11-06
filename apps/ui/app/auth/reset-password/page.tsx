"use client";
import {InterfaceCatalogBoundary} from "@/components/system/InterfaceCatalogBoundary";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { useInterfaceLanguage } from "@/lib/i18n/useInterfaceLanguage";
import { localizedSection, type MessageCatalog } from "@/lib/i18n/catalog";

type MessageKey = keyof MessageCatalog["features"]["authPages"];
function ResetPasswordPageContent() {
  const language = useInterfaceLanguage();
  const copy = localizedSection("authPages")[language];
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase sends auth tokens in the URL hash, we need to handle them
    const handleAuthCallback = async () => {
      const { data, error } = await supabase.auth.getSession();

      console.log("🔐 Reset password page loaded");
      console.log("  - Session:", data.session ? "✅ Valid" : "❌ None");
      console.log("  - Error:", error);

      if (error) {
        setMessageType("error");
        setMessage("authError");
        return;
      }

      if (!data.session) {
        setMessageType("error");
        setMessage("invalidLink");
      }
    };

    handleAuthCallback();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setMessageType("error");
      setMessage("mismatch");
      return;
    }

    if (password.length < 6) {
      setMessageType("error");
      setMessage("tooShort");
      return;
    }

    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setMessageType("error");
      setMessage("updateError");
    } else {
      setMessageType("success");
      setMessage("updated");
      setTimeout(() => {
        router.push("/");
      }, 2000);
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-white/90 px-8 py-10 shadow-xl shadow-slate-900/10 backdrop-blur dark:bg-slate-900/70">
        <div>
          <h1 className="text-center text-3xl font-bold text-slate-900 dark:text-white">
            {copy.title}
          </h1>
          <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            {copy.description}
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {copy.password}
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {copy.confirmPassword}
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
          {message && (
            <p
              className={`text-sm text-center ${
                messageType === "success"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {copy[message]}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:opacity-60"
          >
            {copy.update}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {return <InterfaceCatalogBoundary><ResetPasswordPageContent /></InterfaceCatalogBoundary>;}
