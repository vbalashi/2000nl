"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BrandLogo } from "@/components/BrandLogo";

type AuthMode = "signin";
type Language = "nl" | "en";

const translations = {
  nl: {
    title: "Log in om te beginnen met het leren van de 2000 meest voorkomende Nederlandse woorden.",
    emailLabel: "E-mailadres",
    emailPlaceholder: "jouw@email.nl",
    submitButton: "Stuur Inlogcode",
    submitLoading: "Versturen...",
    successMessage: "Check je inbox! We hebben een inlogcode naar je verstuurd.",
    infoText: "Geen wachtwoord nodig! We sturen een beveiligde code naar je e-mail.",
    otpLabel: "Voer je code in",
    otpPlaceholder: "123456",
    verifyButton: "Verifieer Code",
    verifyLoading: "Verifiëren...",
    resendButton: "Code opnieuw versturen",
    changeEmail: "Ander e-mailadres gebruiken",
  },
  en: {
    title: "Log in to start learning the 2000 most common Dutch words.",
    emailLabel: "Email address",
    emailPlaceholder: "your@email.com",
    submitButton: "Send Login Code",
    submitLoading: "Sending...",
    successMessage: "Check your inbox! We've sent you a login code.",
    infoText: "No password needed! We'll send a secure code to your email.",
    otpLabel: "Enter your code",
    otpPlaceholder: "123456",
    verifyButton: "Verify Code",
    verifyLoading: "Verifying...",
    resendButton: "Resend code",
    changeEmail: "Use different email",
  },
};

export function AuthScreen() {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<Language>("nl");

  useEffect(() => {
    // Detect user's system language
    const browserLang = navigator.language || navigator.languages?.[0] || "nl";
    const detectedLang = browserLang.toLowerCase().startsWith("nl") ? "nl" : "en";
    setLang(detectedLang);

    const card = cardRef.current;
    const cardBg = card ? window.getComputedStyle(card).backgroundColor : null;
    const cardText = card ? window.getComputedStyle(card).color : null;
    const storedThemePreference =
      typeof window !== "undefined"
        ? window.localStorage.getItem("themePreference")
        : null;

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/a5e2db1f-40e6-4b7f-aa6f-678a92a187d8", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "baseline",
        hypothesisId: "H2",
        location: "components/auth/AuthScreen.tsx:21",
        message: "AuthScreen mounted; check theme + styles",
        data: {
          pathname: window.location.pathname,
          hasDarkClass: document.documentElement.classList.contains("dark"),
          storedThemePreference,
          styleSheets: document.styleSheets?.length ?? null,
          bodyBg: window.getComputedStyle(document.body).backgroundColor,
          cardBg,
          cardText,
          detectedLang,
          browserLang,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log
  }, []);

  const handleSendOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    // OTP-only authentication (passwordless)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
    } else {
      setMessageType("success");
      setMessage(translations[lang].successMessage);
      setOtpSent(true);
    }

    setLoading(false);
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
    } else {
      setMessageType("success");
      setMessage("Inloggen succesvol!");
      // Session is set, user will be redirected by the app
    }

    setLoading(false);
  };

  const handleResend = async () => {
    setOtp("");
    setMessage(null);
    setLoading(true);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
    } else {
      setMessageType("success");
      setMessage(translations[lang].successMessage);
    }

    setLoading(false);
  };

  const handleChangeEmail = () => {
    setOtpSent(false);
    setOtp("");
    setMessage(null);
  };

  const t = translations[lang];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div
        ref={cardRef}
        className="w-full max-w-md space-y-6 rounded-2xl bg-white/90 px-8 py-10 shadow-xl shadow-slate-900/10 backdrop-blur dark:bg-slate-900/70"
      >
        <div>
          <div className="flex justify-center">
            <BrandLogo className="text-4xl leading-none font-black tracking-tight text-slate-900 dark:text-white opacity-80 dark:opacity-85" />
          </div>
          <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            {t.title}
          </p>
        </div>
        {!otpSent ? (
          <>
            <form className="space-y-4" onSubmit={handleSendOtp}>
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t.emailLabel}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder={t.emailPlaceholder}
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
                  {message}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? t.submitLoading : t.submitButton}
              </button>
            </form>
            <div className="space-y-2 text-center text-sm text-slate-500 dark:text-slate-400">
              <p>{t.infoText}</p>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.successMessage}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                {email}
              </p>
            </div>
            <form className="space-y-4" onSubmit={handleVerifyOtp}>
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t.otpLabel}
                <input
                  type="text"
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 text-center tracking-widest font-mono text-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder={t.otpPlaceholder}
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
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
                  {message}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? t.verifyLoading : t.verifyButton}
              </button>
            </form>
            <div className="space-y-2 text-center text-sm">
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="text-primary hover:underline dark:text-primary-light disabled:opacity-50"
              >
                {t.resendButton}
              </button>
              <br />
              <button
                type="button"
                onClick={handleChangeEmail}
                className="text-slate-500 hover:underline dark:text-slate-400"
              >
                {t.changeEmail}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
