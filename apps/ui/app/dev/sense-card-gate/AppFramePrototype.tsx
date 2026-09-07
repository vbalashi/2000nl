"use client";

// Three variants of the stable application frame, switchable via
// /dev/sense-card-gate?prototype=app-frame&variant=top-tabs&mode=training.
// This is a read-only design study; it must not become a production shell.

import React from "react";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  AppDestinationNav,
  MobileAppDestinationNav,
} from "@/components/navigation/AppDestinationNav";
import {
  AppUtilityNav,
  type AppUtilityNavProps,
} from "@/components/navigation/AppUtilityNav";
import type { AppDestination } from "@/components/navigation/appDestination";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { TrainingSessionChrome } from "@/components/training/v2/TrainingSessionChrome";
import { TrainingSessionV2Layout } from "@/components/training/v2/TrainingSessionV2Layout";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import { gateFurnitureEntry, gateSingleSenseGroup } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import type { TrainingSessionPresentationSnapshot } from "@/components/training/v2/useTrainingSessionPresentation";
import styles from "./AppFramePrototype.module.css";

type Variant = "top-tabs" | "bottom-tabs" | "menu";
type Mode = "training" | "library";

const variants: Array<{ key: Variant; label: string }> = [
  { key: "top-tabs", label: "Top tabs" },
  { key: "bottom-tabs", label: "Bottom tabs" },
  { key: "menu", label: "Menu" },
];

const modes: Array<{ key: Mode; label: string }> = [
  { key: "training", label: "Training" },
  { key: "library", label: "Library" },
];

function normalizeVariant(value: string | undefined): Variant {
  return variants.some((item) => item.key === value)
    ? (value as Variant)
    : "top-tabs";
}

function normalizeMode(value: string | undefined): Mode {
  return value === "library" ? "library" : "training";
}

function setPrototypeParams(variant: Variant, mode: Mode) {
  const params = new URLSearchParams(window.location.search);
  params.set("prototype", "app-frame");
  params.set("variant", variant);
  params.set("mode", mode);
  window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
}

function StableAppHeader({
  active,
  variant,
  interfaceLanguage,
  utilityNav,
  menuOpen,
  onToggleMenu,
  onNavigate,
}: {
  active: "training" | "library";
  variant: Variant;
  interfaceLanguage: "nl";
  utilityNav: Omit<AppUtilityNavProps, "interfaceLanguage">;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onNavigate: (destination: AppDestination) => void;
}) {
  return (
    <header className={styles.appHeader} data-prototype-frame="app-header">
      <BrandLogo
        className={`${styles.logo} text-[26px] font-normal leading-none tracking-tight text-slate-100`}
        accentClassName="text-[#AAB0FF]"
      />
      <div className={styles.desktopNav}>
        <AppDestinationNav
          active={active}
          interfaceLanguage={interfaceLanguage}
          extendedDestinationsEnabled
          onNavigate={onNavigate}
        />
      </div>
      <div className={styles.mobileActions}>
        {variant === "menu" ? (
          <button
            type="button"
            className={styles.mobileMenuButton}
            aria-expanded={menuOpen}
            aria-label="Open destinations"
            onClick={onToggleMenu}
          >
            <Menu aria-hidden="true" className="h-4 w-4" />
            Menu
          </button>
        ) : null}
        <div className={styles.utility}>
          <AppUtilityNav
            interfaceLanguage={interfaceLanguage}
            {...utilityNav}
            appearance="quiet"
          />
        </div>
      </div>
      {variant === "menu" && menuOpen ? (
        <div className={styles.menuPopover} role="menu">
          {modes.map((mode) => (
            <button
              key={mode.key}
              type="button"
              role="menuitem"
              onClick={() => onNavigate(mode.key)}
            >
              {mode.label}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => onNavigate("statistics")}>
            Statistics
          </button>
        </div>
      ) : null}
    </header>
  );
}

function PrototypeFooter() {
  return (
    <footer className="flex h-[44px] min-h-[44px] flex-none items-center justify-center border-t border-[#394353] px-3 text-[11px] text-[#BFC7D4]">
      <div className="flex w-full max-w-[760px] items-center justify-center gap-8 tabular-nums">
        <span>Nieuw <span className="mx-1 inline-block h-[3px] w-12 rounded bg-[#8B89F6] align-middle" /> 0/10</span>
        <span>Herhaling <span className="mx-1 inline-block h-[3px] w-12 rounded bg-[#D6BB7E] align-middle" /> 6/18</span>
        <span>Totaal <span className="mx-1 inline-block h-[3px] w-12 rounded bg-[#37D99B] align-middle" /> 6/25</span>
      </div>
    </footer>
  );
}

function TrainingPrototype({ variant }: { variant: Variant }) {
  const model = React.useMemo(
    () =>
      buildTrainingSenseCardModel({
        group: { ...gateSingleSenseGroup, entries: [gateFurnitureEntry] },
        entry: gateFurnitureEntry,
        interfaceLanguage: "nl",
      }),
    [],
  );
  const [side, setSide] = React.useState<"face" | "answer">("answer");
  const presentation: TrainingSessionPresentationSnapshot = {
    kind: "planned",
    position: 5,
    total: 23,
    fraction: 5 / 23,
  };
  const chrome = (
    <TrainingSessionChrome
      interfaceLanguage="nl"
      scenario="understanding"
      mode="word-to-definition"
      cardFilter="both"
      presentation={presentation}
      onClose={() => undefined}
      onHistory={() => undefined}
    />
  );
  const card = (
    <TrainingSenseCardStage
      model={model}
      mode="word-to-definition"
      interfaceLanguage="nl"
      side={side}
      onSideChange={setSide}
      onPlayAudio={() => undefined}
      onOpenDetails={() => undefined}
      onAction={() => undefined}
    />
  );
  return (
    <div className={styles.trainingSurface}>
      <TrainingSessionV2Layout
        phase="ready"
        chrome={chrome}
        footer={<PrototypeFooter />}
      >
        {card}
      </TrainingSessionV2Layout>
      {variant === "bottom-tabs" ? (
        <MobileAppDestinationNav
          active="training"
          interfaceLanguage="nl"
          extendedDestinationsEnabled
          onNavigate={() => undefined}
        />
      ) : null}
    </div>
  );
}

function LibraryPrototype({ variant }: { variant: Variant }) {
  const model = React.useMemo(
    () => buildLibrarySenseCardGroupModel(gateSingleSenseGroup, "nl"),
    [],
  );
  return (
    <div className={styles.librarySurface}>
      <p className={styles.libraryHeading}>Words, sources and collections</p>
      <div className={styles.libraryCard}>
        <LibrarySenseCardGroup
          model={model}
          interfaceLanguage="nl"
          translationEnabled
          collectionCounts={{ [gateFurnitureEntry.entryId]: 1 }}
          onPlayAudio={() => undefined}
          onOpenCollections={() => undefined}
          onTrainNext={() => undefined}
          onAction={() => undefined}
        />
      </div>
      {variant === "bottom-tabs" ? (
        <MobileAppDestinationNav
          active="library"
          interfaceLanguage="nl"
          extendedDestinationsEnabled
          onNavigate={() => undefined}
        />
      ) : null}
    </div>
  );
}

function PrototypeSwitcher({
  variant,
  mode,
  onVariant,
  onMode,
}: {
  variant: Variant;
  mode: Mode;
  onVariant: (variant: Variant) => void;
  onMode: (mode: Mode) => void;
}) {
  const currentIndex = variants.findIndex((item) => item.key === variant);
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      onVariant(variants[(currentIndex + offset + variants.length) % variants.length].key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, onVariant]);

  const move = (offset: number) => {
    onVariant(variants[(currentIndex + offset + variants.length) % variants.length].key);
  };
  return (
    <div className={styles.prototypeBar} aria-label="App frame prototype controls">
      <button type="button" aria-label="Previous variant" onClick={() => move(-1)}>
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <span className={styles.prototypeLabel}>
        {variant} · {variants[currentIndex]?.label}
      </span>
      <button type="button" aria-label="Next variant" onClick={() => move(1)}>
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
      <span aria-hidden="true" className="h-5 w-px bg-[#394353]" />
      {modes.map((item) => (
        <button
          key={item.key}
          type="button"
          data-active={mode === item.key}
          onClick={() => onMode(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function AppFramePrototype({
  initialVariant,
  initialMode,
}: {
  initialVariant?: string;
  initialMode?: string;
}) {
  const [variant, setVariant] = React.useState(() => normalizeVariant(initialVariant));
  const [mode, setMode] = React.useState(() => normalizeMode(initialMode));
  const [themePreference, setThemePreference] =
    React.useState<ThemePreference>("dark");
  const [menuOpen, setMenuOpen] = React.useState(false);

  const updateVariant = React.useCallback(
    (next: Variant) => {
      setVariant(next);
      setPrototypeParams(next, mode);
    },
    [mode],
  );
  const updateMode = React.useCallback(
    (next: Mode) => {
      setMode(next);
      setMenuOpen(false);
      setPrototypeParams(variant, next);
    },
    [variant],
  );
  const cycleTheme = React.useCallback(() => {
    setThemePreference((current) =>
      current === "dark" ? "light" : current === "light" ? "system" : "dark",
    );
  }, []);
  const utilityNav = {
    themePreference,
    onCycleTheme: cycleTheme,
    onOpenSettings: () => undefined,
  } satisfies Omit<AppUtilityNavProps, "interfaceLanguage">;
  const onNavigate = (destination: AppDestination) => {
    if (destination === "training" || destination === "library") {
      updateMode(destination);
    }
  };
  return (
    <div className={`${styles.prototype} dark`} data-prototype="app-frame">
      <StableAppHeader
        active={mode}
        variant={variant}
        interfaceLanguage="nl"
        utilityNav={utilityNav}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onNavigate={onNavigate}
      />
      {variant === "top-tabs" ? (
        <div className={styles.mobileTabsRow}>
          <AppDestinationNav
            active={mode}
            interfaceLanguage="nl"
            variant="mobile-tabs"
            extendedDestinationsEnabled
            onNavigate={onNavigate}
          />
        </div>
      ) : null}
      <main className={styles.content}>
        {mode === "training" ? (
          <TrainingPrototype variant={variant} />
        ) : (
          <LibraryPrototype variant={variant} />
        )}
      </main>
      <PrototypeSwitcher
        variant={variant}
        mode={mode}
        onVariant={updateVariant}
        onMode={updateMode}
      />
    </div>
  );
}
