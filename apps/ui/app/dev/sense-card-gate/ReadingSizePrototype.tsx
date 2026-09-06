"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DetailedStats, TrainingMode } from "@/lib/types";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import {
  TrainingSessionAppHeader,
  TrainingSessionChrome,
} from "@/components/training/v2/TrainingSessionChrome";
import {
  TrainingSessionV2Layout,
} from "@/components/training/v2/TrainingSessionV2Layout";
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
type ReadingStyleVars = React.CSSProperties & Record<`--${string}`, string>;

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

const styleVars: Record<ReadingVariant, ReadingStyleVars> = {
  normal: {
    "--reading-body-size": "16px",
    "--reading-body-leading": "1.15",
    "--reading-body-prompt-size": "clamp(1.55rem, 5cqi, 2.4rem)",
    "--reading-literary-size": "16px",
    "--reading-literary-leading": "1.4",
    "--reading-literary-compact-size": "14px",
    "--reading-literary-compact-leading": "1.25",
    "--reading-nested-size": "13px",
    "--reading-nested-leading": "1.35",
    "--reading-translation-size": "13px",
    "--reading-translation-leading": "1.35",
    "--reading-translation-emphasis-size": "15px",
    "--reading-headword-face-size": "48px",
    "--reading-headword-answer-size": "44px",
    "--reading-headword-long-size": "32px",
    "--reading-headword-long-size-sm": "40px",
    "--reading-article-face-size": "24px",
    "--reading-article-answer-size": "20px",
  },
  large: {
    "--reading-body-size": "18px",
    "--reading-body-leading": "1.28",
    "--reading-body-prompt-size": "clamp(1.7rem, 5.4cqi, 2.55rem)",
    "--reading-literary-size": "18px",
    "--reading-literary-leading": "1.5",
    "--reading-literary-compact-size": "15.5px",
    "--reading-literary-compact-leading": "1.35",
    "--reading-nested-size": "14px",
    "--reading-nested-leading": "1.4",
    "--reading-translation-size": "14px",
    "--reading-translation-leading": "1.45",
    "--reading-translation-emphasis-size": "16px",
    "--reading-headword-face-size": "50px",
    "--reading-headword-answer-size": "46px",
    "--reading-headword-long-size": "34px",
    "--reading-headword-long-size-sm": "42px",
    "--reading-article-face-size": "25px",
    "--reading-article-answer-size": "21px",
  },
  largest: {
    "--reading-body-size": "20px",
    "--reading-body-leading": "1.38",
    "--reading-body-prompt-size": "clamp(1.85rem, 5.8cqi, 2.7rem)",
    "--reading-literary-size": "20px",
    "--reading-literary-leading": "1.55",
    "--reading-literary-compact-size": "17px",
    "--reading-literary-compact-leading": "1.4",
    "--reading-nested-size": "15px",
    "--reading-nested-leading": "1.45",
    "--reading-translation-size": "15px",
    "--reading-translation-leading": "1.5",
    "--reading-translation-emphasis-size": "17px",
    "--reading-headword-face-size": "52px",
    "--reading-headword-answer-size": "48px",
    "--reading-headword-long-size": "36px",
    "--reading-headword-long-size-sm": "44px",
    "--reading-article-face-size": "26px",
    "--reading-article-answer-size": "22px",
  },
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
  fixture: { short: "Short content", long: "Long content" },
  translations: { on: "Translations on", off: "Translations off" },
  mode: modeLabels,
} as const;

function readVariant(value: string | null): ReadingVariant {
  return variants.includes(value as ReadingVariant)
    ? (value as ReadingVariant)
    : "normal";
}

function readFixture(value: string | null): ReadingFixtureKey {
  return value === "long" ? "long" : "short";
}

function readMode(value: string | null): ReadingMode {
  return value === "reverse" ? "reverse" : "direct";
}

export function ReadingSizePrototype() {
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
      style={styleVars[variant]}
      data-reading-size-prototype="true"
      data-reading-size={variant}
      data-reading-fixture={fixtureKey}
      data-reading-mode={modeKey}
      data-reading-translations={translationsEnabled ? "on" : "off"}
    >
      <TrainingSessionAppHeader
        interfaceLanguage="nl"
        themePreference={theme}
        onCycleTheme={cycleTheme}
        onOpenSettings={() => undefined}
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
      {clean ? (
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
