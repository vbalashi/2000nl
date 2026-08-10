"use client";

import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";

const copy = {
  nl: {
    theme: "Thema",
    light: "Licht",
    dark: "Donker",
    system: "Systeem",
    search: "Zoeken",
    settings: "Instellingen",
    help: "Help",
    history: "Geschiedenis",
    account: "Account",
    accountMenu: "Accountmenu",
    signedInAs: "Ingelogd als",
    statistics: "Statistieken",
    signOut: "Afmelden",
  },
  en: {
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    search: "Search",
    settings: "Settings",
    help: "Help",
    history: "History",
    account: "Account",
    accountMenu: "Account menu",
    signedInAs: "Signed in as",
    statistics: "Statistics",
    signOut: "Sign out",
  },
  ru: {
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    system: "Системная",
    search: "Поиск",
    settings: "Настройки",
    help: "Помощь",
    history: "История",
    account: "Аккаунт",
    accountMenu: "Меню аккаунта",
    signedInAs: "Выполнен вход",
    statistics: "Статистика",
    signOut: "Выйти",
  },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

export type AppUtilityNavProps = {
  interfaceLanguage: OnboardingLanguage;
  themePreference: ThemePreference;
  settingsActive?: boolean;
  historyActive?: boolean;
  userEmail: string;
  onCycleTheme: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenHistory: () => void;
  onOpenStatistics?: () => void;
  onSignOut: () => void | Promise<void>;
};

function UtilityButton({
  label,
  active = false,
  current = false,
  onClick,
  children,
  tour,
}: {
  label: string;
  active?: boolean;
  current?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tour?: string;
}) {
  return (
    <Tooltip content={label} side="bottom" showOnFocus={false}>
      <button
        type="button"
        aria-label={label}
        aria-current={current ? "page" : undefined}
        aria-pressed={active || current}
        data-tour={tour}
        onClick={onClick}
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm transition md:h-10 md:w-10 ${
          active || current
            ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-900"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "dark") {
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"
        />
      </svg>
    );
  }
  if (preference === "system") {
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 3v1m0 0a8 8 0 0 1 0 16m0-16a8 8 0 0 0 0 16m0 0v1M4.2 4.2l.7.7M3 12h1M4.2 19.8l.7-.7M6 18 18 6"
        />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.4 6.4-.7-.7M6.3 6.3l-.7-.7m12.8 0-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
      />
    </svg>
  );
}

export function AppUtilityNav({
  interfaceLanguage,
  themePreference,
  settingsActive = false,
  historyActive = false,
  userEmail,
  onCycleTheme,
  onOpenSearch,
  onOpenSettings,
  onOpenHelp,
  onOpenHistory,
  onOpenStatistics,
  onSignOut,
}: AppUtilityNavProps) {
  const text = copy[interfaceLanguage];
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const themeLabel = `${text.theme}: ${text[themePreference]}`;

  useEffect(() => {
    if (!accountOpen) return;
    const closeOutside = (event: MouseEvent | TouchEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    window.addEventListener("mousedown", closeOutside);
    window.addEventListener("touchstart", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("touchstart", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  return (
    <div className="flex items-center gap-1 justify-self-end text-sm text-slate-500 md:gap-2 dark:text-slate-300">
      <UtilityButton label={themeLabel} onClick={onCycleTheme}>
        <ThemeIcon preference={themePreference} />
      </UtilityButton>
      <UtilityButton
        label={text.search}
        onClick={onOpenSearch}
        tour="search-button"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
          />
        </svg>
      </UtilityButton>
      <UtilityButton
        label={text.settings}
        current={settingsActive}
        onClick={onOpenSettings}
        tour="settings-button"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10.3 4.3c.4-1.7 2.9-1.7 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.3 2.4a1.7 1.7 0 0 0 1.1 2.5c1.7.5 1.7 3 0 3.4a1.7 1.7 0 0 0-1.1 2.6c1 1.5-.8 3.3-2.3 2.3a1.7 1.7 0 0 0-2.6 1.1c-.5 1.7-3 1.7-3.4 0a1.7 1.7 0 0 0-2.6-1.1c-1.5 1-3.3-.8-2.3-2.3a1.7 1.7 0 0 0-1.1-2.6c-1.7-.4-1.7-2.9 0-3.4a1.7 1.7 0 0 0 1.1-2.5c-1-1.6.8-3.3 2.3-2.4a1.7 1.7 0 0 0 2.6-1.1Z"
          />
          <circle cx="12" cy="12" r="3" strokeWidth="2" />
        </svg>
      </UtilityButton>
      <UtilityButton label={text.help} onClick={onOpenHelp}>
        <span aria-hidden="true" className="text-base font-semibold">
          ?
        </span>
      </UtilityButton>
      <UtilityButton
        label={text.history}
        active={historyActive}
        onClick={onOpenHistory}
        tour="sidebar-toggle"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 8v4l3 2"
          />
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
        </svg>
      </UtilityButton>
      <div ref={accountMenuRef} className="relative z-50">
        <UtilityButton
          label={text.account}
          active={accountOpen}
          onClick={() => setAccountOpen((open) => !open)}
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5.1 17.8A14 14 0 0 1 12 16c2.5 0 4.8.7 6.9 1.8M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
            />
          </svg>
        </UtilityButton>
        {accountOpen ? (
          <div
            role="menu"
            aria-label={text.accountMenu}
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {text.signedInAs}
              </p>
              <p className="mt-1 truncate text-sm font-semibold">{userEmail}</p>
            </div>
            {onOpenStatistics ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  onOpenStatistics();
                }}
                className="w-full border-t border-slate-100 px-3 py-2.5 text-left text-sm font-semibold dark:border-slate-800"
              >
                {text.statistics}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAccountOpen(false);
                void onSignOut();
              }}
              className="w-full border-t border-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-red-600 dark:border-slate-800 dark:text-red-300"
            >
              {text.signOut}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
