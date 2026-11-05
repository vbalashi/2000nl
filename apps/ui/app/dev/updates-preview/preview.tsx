"use client";
import React, { useState } from "react";
import { AppReleaseContext } from "@/components/releases/AppReleaseContext";
import {
  ReleaseBanner,
  ReleaseUpdatesSection,
} from "@/components/releases/ReleaseUpdates";
import type { AppReleaseState } from "@/components/releases/useAppRelease";
import { SettingsOptions } from "@/components/practice/settings/SettingsLayout";
import type { AppRelease } from "@/lib/releases/appRelease";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import theme from "@/components/practice/ui/practiceTheme.module.css";
const installed = {
  version: "1.0",
  commit: "a".repeat(40),
  commitShort: "aaaaaaaa",
  buildTimestamp: "2026-11-01T08:00:00Z",
  formattedBuildTimestamp: "",
  display: "v1.0",
};
const noop = () => {};
/** Synthetic installed build, live database notes and production components. Never reloads or deploys. */
export function UpdatesPreview({
  release,
  language,
}: {
  release: AppRelease | null;
  language: OnboardingLanguage;
}) {
  const [mode, setMode] = useState<"light" | "dark">("light"),
    [banner, setBanner] = useState(true);
  const state: AppReleaseState = {
    installed,
    release,
    status: "ready",
    updateAvailable: true,
    unread: true,
    attention: true,
    banner,
    unsafe: false,
    development: false,
    check: async () => null,
    update: async () => {},
    dismiss: () => setBanner(false),
    markRead: noop,
  };
  return (
    <main
      className={theme.theme}
      data-colour-mode={mode}
      style={{
        minHeight: "100dvh",
        background: "var(--practice-canvas)",
        color: "var(--practice-text)",
        fontFamily: "var(--practice-font-ui)",
        padding: "24px 0",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px 16px" }}>
        <SettingsOptions
          label="Preview colour mode"
          value={mode}
          onChange={setMode}
          items={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
        />
      </div>
      <AppReleaseContext.Provider value={state}>
        <ReleaseBanner language={language} />
        <div style={{ maxWidth: 620, margin: "32px auto", padding: "0 20px" }}>
          <ReleaseUpdatesSection language={language} />
        </div>
      </AppReleaseContext.Provider>
    </main>
  );
}
