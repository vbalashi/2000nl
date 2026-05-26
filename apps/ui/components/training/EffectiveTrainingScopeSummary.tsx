import React from "react";
import type { CardFilter, TrainingMode, WordListSummary } from "@/lib/types";

const CARD_FILTER_LABELS: Record<CardFilter, string> = {
  both: "Nieuw + herhaling",
  new: "Alleen nieuw",
  review: "Alleen herhaling",
};

const CARD_MODE_LABELS: Record<TrainingMode, string> = {
  "word-to-definition": "Woord -> definitie",
  "definition-to-word": "Definitie -> woord",
  "listen-recognize": "Luisteren",
  "listen-type": "Luisteren typen",
};

const SCENARIO_LABELS: Record<string, string> = {
  understanding: "Begrip",
  listening: "Luisteren",
  conjugation: "Vervoegingen",
};

const scenarioLabel = (scenarioId: string | null | undefined) => {
  if (!scenarioId) return null;
  return SCENARIO_LABELS[scenarioId] ?? scenarioId;
};

const formatCardModes = (modes: string[] | null | undefined) => {
  const labels = (modes ?? [])
    .map((mode) => CARD_MODE_LABELS[mode as TrainingMode] ?? mode)
    .filter(Boolean);
  return labels.length ? labels.join(", ") : "geen kaarttypes ingesteld";
};

const listPolicyLabel = (activeList: WordListSummary | null | undefined) => {
  if (!activeList) return "Geen actieve lijst";

  const defaultScenario = scenarioLabel(activeList.default_scenario_id);
  const cardPolicy = activeList.card_policy ?? "inherit";
  const cardModes = formatCardModes(activeList.card_type_ids);

  if (cardPolicy === "restrict") {
    return defaultScenario
      ? `Standaard ${defaultScenario}; beperkt tot ${cardModes}`
      : `Beperkt tot ${cardModes}`;
  }

  if (cardPolicy === "prefer") {
    return defaultScenario
      ? `Standaard ${defaultScenario}; voorkeur ${cardModes}`
      : `Voorkeur ${cardModes}`;
  }

  return defaultScenario
    ? `Standaard scenario: ${defaultScenario}`
    : "Geen lijststandaard";
};

type Props = {
  activeList: WordListSummary | null;
  activeScenarioName: string;
  cardFilter: CardFilter;
  className?: string;
  showFooterSelectorHint?: boolean;
};

export function EffectiveTrainingScopeSummary({
  activeList,
  activeScenarioName,
  cardFilter,
  className,
  showFooterSelectorHint = false,
}: Props) {
  const activeListName = activeList?.name ?? "Geen actieve lijst";
  const compactSummary = `Training: ${activeListName} · ${activeScenarioName} · ${CARD_FILTER_LABELS[cardFilter]}`;
  const policyDetails = listPolicyLabel(activeList);

  return (
    <section
      aria-label="Training"
      className={[
        "rounded-2xl border border-slate-200 bg-white/75 px-3 py-2 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900/60",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-100">
          {compactSummary}
        </p>
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300"
          title={
            showFooterSelectorHint
              ? `${policyDetails}. De lijstkeuze in de footer wijzigt normale training.`
              : policyDetails
          }
          aria-label={policyDetails}
        >
          i
        </span>
      </div>
    </section>
  );
}
