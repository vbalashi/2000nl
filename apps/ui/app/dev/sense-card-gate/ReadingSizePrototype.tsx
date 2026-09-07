"use client";

import React from "react";
import { ReadingPreferencesProvider } from "@/components/reading/ReadingPreferencesProvider";
import { ReadingSettingsSection } from "@/components/reading/ReadingSettingsSection";
import { readingSizeStyles as styleVars } from "@/lib/reading/readingSize";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DetailedStats, TrainingMode } from "@/lib/types";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import { AppHeader } from "@/components/navigation/AppFrame";
import { TrainingSessionChrome } from "@/components/training/v2/TrainingSessionChrome";
import { TrainingSessionV2Layout } from "@/components/training/v2/TrainingSessionV2Layout";
import type { TrainingSessionPresentationSnapshot } from "@/components/training/v2/useTrainingSessionPresentation";
import { FlagIcon, senseCardQuietActionClassName } from "@/components/training/SenseCardChrome";
import sessionStyles from "@/components/training/v2/TrainingSessionLayout.module.css";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import { FooterStats } from "@/components/training/FooterStats";
import styles from "./ReadingSizePrototype.module.css";
import {
  readingSizePrototypeFixtures,
  withReadingTranslations,
  type ReadingFixtureKey,
} from "./readingSizePrototypeFixtures";

type ReadingVariant = "normal" | "large" | "largest";
type ReadingMode = "direct" | "reverse";

const variants: ReadingVariant[] = ["normal", "large", "largest"];
const variantLabels: Record<ReadingVariant, string> = {
  normal: "Normal",
  large: "Large",
  largest: "Largest",
};
const modeLabels: Record<ReadingMode, string> = {
  direct: "Direct",
  reverse: "Reverse",
};

const stats: DetailedStats = {
  newWordsToday: 4,
  newCardsToday: 4,
  dailyNewLimit: 10,
  reviewWordsDone: 3,
  reviewCardsDone: 3,
  reviewWordsDue: 9,
  reviewCardsDue: 9,
  totalWordsLearned: 42,
  totalWordsInList: 120,
};

const presentation: TrainingSessionPresentationSnapshot = {
  kind: "planned",
  position: 4,
  total: 12,
  fraction: 4 / 12,
};

const copy = {
  fixture: { short: "Short content", long: "Long content", "long-word": "Long word (layout fixture)" },
  translations: { on: "Translations on", off: "Translations off" },
  mode: modeLabels,
} as const;

function readVariant(value: string | null): ReadingVariant {
  return variants.includes(value as ReadingVariant)
    ? (value as ReadingVariant)
    : "normal";
}

function readFixture(value: string | null): ReadingFixtureKey {
  return value === "long" || value === "long-word" ? value : "short";
}

function readMode(value: string | null): ReadingMode {
  return value === "reverse" ? "reverse" : "direct";
}

// Uses the actual settings repository. Browser tests intercept its external
// storage boundary; this dev-only harness never mints an authenticated session.
export function ReadingSettingsGate() {
  return <ReadingPreferencesProvider userId="00000000-0000-4000-8000-000000000265">
    <ReadingSizePrototype persistedSettings />
  </ReadingPreferencesProvider>;
}

export function ReadingSizePrototype({ persistedSettings = false }: { persistedSettings?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const variant = readVariant(searchParams.get("variant"));
  const fixtureKey = readFixture(searchParams.get("fixture"));
  const modeKey = readMode(searchParams.get("mode"));
  const trainingMode: TrainingMode =
    modeKey === "reverse" ? "definition-to-word" : "word-to-definition";
  const translationsEnabled = searchParams.get("translations") !== "off";
  const clean = searchParams.get("clean") === "1";
  const [side, setSide] = React.useState<"face" | "answer">("face");
  const [theme, setTheme] = React.useState<ThemePreference>("system");
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  React.useEffect(() => {
    const root = document.documentElement;
    const hadDarkClass = root.classList.contains("dark");
    setTheme(hadDarkClass ? "dark" : "light");
    return () => {
      root.classList.toggle("dark", hadDarkClass);
    };
  }, []);

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null) next.delete(key);
      else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const cycleVariant = React.useCallback((direction: -1 | 1) => {
    const index = variants.indexOf(variant);
    setParam(
      "variant",
      variants[(index + direction + variants.length) % variants.length],
    );
  }, [setParam, variant]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        cycleVariant(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycleVariant]);
  const cycleTheme = () => {
    const next: ThemePreference = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  };

  const fixture = withReadingTranslations(
    readingSizePrototypeFixtures[fixtureKey],
    translationsEnabled,
  );
  const model = buildTrainingSenseCardModel({
    group: fixture.group,
    entry: fixture.entry,
    interfaceLanguage: "nl",
  });

  return (
    <div
      className={`${sessionStyles.viewport} flex h-screen h-[100dvh] flex-col overflow-hidden bg-background-light text-slate-900 dark:bg-background-dark dark:text-slate-100`}
      style={persistedSettings ? undefined : styleVars[variant]}
      data-reading-size-prototype="true"
      data-reading-size={persistedSettings ? undefined : variant}
      data-reading-fixture={fixtureKey}
      data-reading-mode={modeKey}
      data-reading-translations={translationsEnabled ? "on" : "off"}
    >
      <AppHeader
        activeDestination="training"
        interfaceLanguage="nl"
        themePreference={theme}
        onNavigate={() => undefined}
        onCycleTheme={cycleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <TrainingSessionV2Layout
        phase="ready"
        chrome={
          <TrainingSessionChrome
            interfaceLanguage="nl"
            scenario="comprehension"
            mode={trainingMode}
            cardFilter="both"
            presentation={presentation}
            sessionName="Leesritme · prototype"
            onHistory={() => undefined}
            onClose={() => undefined}
          />
        }
        footer={
          <FooterStats
            stats={stats}
            enabledModes={[trainingMode]}
            cardFilter="both"
            onModesChange={() => undefined}
            onCardFilterChange={() => undefined}
            language="nl"
            onLanguageChange={() => undefined}
            activeScenarioName="Begrip"
            initialReviewDue={9}
            inlineControlsEnabled={false}
            compact
            interfaceLanguage="nl"
          />
        }
      >
        <div className="contents">
          <TrainingSenseCardStage
            model={model}
            mode={trainingMode}
            interfaceLanguage="nl"
            side={side}
            onSideChange={setSide}
            onPlayAudio={() => undefined}
            onOpenDetails={() => undefined}
            reportAction={<PreviewReportAction />}
            onAction={() => undefined}
          />
        </div>
      </TrainingSessionV2Layout>
      {persistedSettings ? null : clean ? (
        <button
          type="button"
          className={styles.cleanStamp}
          aria-label="Show reading size prototype controls"
          onClick={() => setParam("clean", null)}
        >
          Prototype · {variantLabels[variant]}
        </button>
      ) : (
        <PrototypeToolbar
          variant={variant}
          fixtureKey={fixtureKey}
          modeKey={modeKey}
          translationsEnabled={translationsEnabled}
          onVariantChange={(next) => setParam("variant", next)}
          onFixtureChange={(next) => setParam("fixture", next)}
          onModeChange={(next) => setParam("mode", next)}
          onTranslationsChange={(next) => setParam("translations", next ? null : "off")}
          onPrevious={() => cycleVariant(-1)}
          onNext={() => cycleVariant(1)}
          onClean={() => setParam("clean", "1")}
        />
      )}
      {settingsOpen && <div role="dialog" aria-label="Reading settings" className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl">
          <button type="button" className="mb-4 min-h-11 rounded-xl border px-4" onClick={() => setSettingsOpen(false)}>Back to card</button>
          <ReadingSettingsSection language="en" />
        </div>
      </div>}
    </div>
  );
}

function PreviewReportAction() {
  return (
    <button
      type="button"
      data-testid="reading-size-prototype-report"
      className={senseCardQuietActionClassName}
      onClick={() => undefined}
      title="Preview only — no report is sent"
    >
      <FlagIcon className="h-4 w-4" /> Melden
    </button>
  );
}

function PrototypeToolbar({
  variant,
  fixtureKey,
  modeKey,
  translationsEnabled,
  onVariantChange,
  onFixtureChange,
  onModeChange,
  onTranslationsChange,
  onPrevious,
  onNext,
  onClean,
}: {
  variant: ReadingVariant;
  fixtureKey: ReadingFixtureKey;
  modeKey: ReadingMode;
  translationsEnabled: boolean;
  onVariantChange: (value: ReadingVariant) => void;
  onFixtureChange: (value: ReadingFixtureKey) => void;
  onModeChange: (value: ReadingMode) => void;
  onTranslationsChange: (value: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClean: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <aside
      className={`${styles.toolbar} ${expanded ? styles.expanded : ""}`}
      aria-label="Reading size prototype controls"
    >
      {!expanded ? (
        <button
          type="button"
          className={styles.compactToggle}
          onClick={() => setExpanded(true)}
          aria-expanded="false"
        >
          Reading · {variantLabels[variant]}
        </button>
      ) : null}
      {expanded ? (
        <>
          <div className={styles.toolbarHeader}>
            <span className={styles.toolbarTitle}>Reading size · prototype</span>
            <div className={styles.toolbarRow}>
              <button type="button" onClick={() => setExpanded(false)}>
                Close
              </button>
              <button type="button" onClick={onClean} title="Hide controls for capture">
                Clean
              </button>
            </div>
          </div>
          <div className={styles.toolbarRow}>
            <button type="button" onClick={onPrevious} aria-label="Previous reading size">
              ←
            </button>
            <select
              aria-label="Reading size"
              value={variant}
              onChange={(event) => onVariantChange(event.target.value as ReadingVariant)}
            >
              {variants.map((key) => (
                <option key={key} value={key}>{variantLabels[key]}</option>
              ))}
            </select>
            <button type="button" onClick={onNext} aria-label="Next reading size">
              →
            </button>
          </div>
          <div className={styles.toolbarRow}>
            <select
              aria-label="Training mode"
              value={modeKey}
              onChange={(event) => onModeChange(event.target.value as ReadingMode)}
            >
              {Object.keys(modeLabels).map((key) => (
                <option key={key} value={key}>{copy.mode[key as ReadingMode]}</option>
              ))}
            </select>
            <select
              aria-label="Content fixture"
              value={fixtureKey}
              onChange={(event) => onFixtureChange(event.target.value as ReadingFixtureKey)}
            >
              <option value="short">{copy.fixture.short}</option>
              <option value="long">{copy.fixture.long}</option>
              <option value="long-word">{copy.fixture["long-word"]}</option>
            </select>
            <button type="button" onClick={() => onTranslationsChange(!translationsEnabled)}>
              {translationsEnabled ? copy.translations.on : copy.translations.off}
            </button>
          </div>
          <details className={styles.toolbarDetails}>
            <summary>Proposed values (px)</summary>
            <table className={styles.values}>
              <thead><tr><th>Role</th><th>Normal</th><th>Large</th><th>Largest</th></tr></thead>
              <tbody>
                <tr><td>Body</td><td>16 / 1.15</td><td>18 / 1.28</td><td>20 / 1.38</td></tr>
                <tr><td>Literary</td><td>16 / 1.4</td><td>18 / 1.5</td><td>20 / 1.55</td></tr>
                <tr><td>Headword</td><td>48 / 44</td><td>50 / 46</td><td>52 / 48</td></tr>
                <tr><td>Utilities</td><td colSpan={3}>unchanged</td></tr>
              </tbody>
            </table>
          </details>
        </>
      ) : null}
    </aside>
  );
}
