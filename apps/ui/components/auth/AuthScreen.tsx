"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BrandLogo } from "@/components/BrandLogo";
import { sendAgentLog } from "@/lib/agentLog";

type AuthMode = "signin";
type Language = "nl" | "en";

const PENDING_OTP_STORAGE_KEY = "auth:pendingOtpEmail";

const DEFAULT_OTP_LENGTH = 8;
const OTP_LENGTH = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_OTP_LENGTH;
  if (!raw) {
    return DEFAULT_OTP_LENGTH;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OTP_LENGTH;
  }
  return parsed;
})();
const OTP_PLACEHOLDER = Array.from({ length: OTP_LENGTH }, (_, i) =>
  String((i + 1) % 10)
).join("");

const translations = {
  nl: {
    title: "Log in om te beginnen met het leren van de 2000 meest voorkomende Nederlandse woorden.",
    emailLabel: "E-mailadres",
    emailPlaceholder: "jouw@email.nl",
    submitButton: "Stuur Inlogcode",
    submitLoading: "Versturen...",
    googleButton: "Doorgaan met Google",
    googleError: "Kon Google-aanmelding niet starten. Probeer opnieuw.",
    successMessage: "Check je inbox! We hebben een inlogcode naar je verstuurd.",
    infoText: "Geen wachtwoord nodig! We sturen een beveiligde code naar je e-mail.",
    orDivider: "of",
    otpLabel: "Voer je code in",
    otpPlaceholder: OTP_PLACEHOLDER,
    verifyButton: "Verifieer Code",
    verifyLoading: "Verifiëren...",
    resendButton: "Code opnieuw versturen",
    changeEmail: "Ander e-mailadres gebruiken",
    haveCodeToggle: "Heb je al een code?",
    hideCodeToggle: "Code invoer verbergen",
    otpHelp:
      "Werkt de e-mail link niet (bijv. opent hij in de verkeerde browser)? Kopieer de code uit de e-mail en plak hem hier.",
    loginSuccess: "Inloggen succesvol!",
  },
  en: {
    title: "Log in to start learning the 2000 most common Dutch words.",
    emailLabel: "Email address",
    emailPlaceholder: "your@email.com",
    submitButton: "Send Login Code",
    submitLoading: "Sending...",
    googleButton: "Continue with Google",
    googleError: "Unable to start Google sign-in. Please try again.",
    successMessage: "Check your inbox! We've sent you a login code.",
    infoText: "No password needed! We'll send a secure code to your email.",
    orDivider: "or",
    otpLabel: "Enter your code",
    otpPlaceholder: OTP_PLACEHOLDER,
    verifyButton: "Verify Code",
    verifyLoading: "Verifying...",
    resendButton: "Resend code",
    changeEmail: "Use different email",
    haveCodeToggle: "Already have a code?",
    hideCodeToggle: "Hide code entry",
    otpHelp:
      "If the email link doesn't work (for example it opens in the wrong browser), copy the code from the email and paste it here.",
    loginSuccess: "Signed in successfully!",
  },
};

export function AuthScreen() {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [showOtpEntry, setShowOtpEntry] = useState(false);
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
    sendAgentLog({
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
    });
    // #endregion agent log

    // Restore OTP flow state after refresh or when returning from mail app.
    try {
      const storedEmail = window.localStorage.getItem(PENDING_OTP_STORAGE_KEY);
      if (storedEmail) {
        setEmail(storedEmail);
        setOtpSent(true);
      }
    } catch {
      // ignore
    }
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
      try {
        window.localStorage.setItem(PENDING_OTP_STORAGE_KEY, email);
      } catch {
        // ignore
      }
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
      type: "email",
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
    } else {
      setMessageType("success");
      setMessage(translations[lang].loginSuccess);
      try {
        window.localStorage.removeItem(PENDING_OTP_STORAGE_KEY);
      } catch {
        // ignore
      }
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

  const handleGoogleSignIn = async () => {
    setMessage(null);
    setLoading(true);
    try {
      window.localStorage.removeItem(PENDING_OTP_STORAGE_KEY);
    } catch {
      // ignore
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      setMessageType("error");
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    setMessageType("error");
    setMessage(t.googleError);
    setLoading(false);
  };

  const handleChangeEmail = () => {
    setOtpSent(false);
    setOtp("");
    setShowOtpEntry(false);
    setMessage(null);
    try {
      window.localStorage.removeItem(PENDING_OTP_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const t = translations[lang];
  const handleOtpChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = event.target.value.replace(/\D/g, "");
    setOtp(digitsOnly.slice(0, OTP_LENGTH));
  };

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
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowOtpEntry((prev) => !prev)}
                className="text-xs font-semibold text-primary hover:underline dark:text-primary-light"
              >
                {showOtpEntry ? t.hideCodeToggle : t.haveCodeToggle}
              </button>
            </div>
            {showOtpEntry ? (
              <div className="space-y-3">
                <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                  {t.otpHelp}
                </p>
                <form className="space-y-4" onSubmit={handleVerifyOtp}>
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {t.otpLabel}
                    <input
                      type="text"
                      required
                      value={otp}
                      onChange={handleOtpChange}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 text-center tracking-widest font-mono text-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      placeholder={t.otpPlaceholder}
                      maxLength={OTP_LENGTH}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {loading ? t.verifyLoading : t.verifyButton}
                  </button>
                </form>
              </div>
            ) : null}
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span>{t.orDivider}</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600"
            >
              {t.googleButton}
            </button>
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
            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
              {t.otpHelp}
            </p>
            <form className="space-y-4" onSubmit={handleVerifyOtp}>
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t.otpLabel}
                <input
                  type="text"
                  required
                  value={otp}
                  onChange={handleOtpChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 text-center tracking-widest font-mono text-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder={t.otpPlaceholder}
                  maxLength={OTP_LENGTH}
                  inputMode="numeric"
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
