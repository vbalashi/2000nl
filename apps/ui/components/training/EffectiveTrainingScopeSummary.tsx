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
  const summaryItems = [
    {
      label: "Actieve trainingslijst",
      value: activeList?.name ?? "Geen actieve lijst",
    },
    { label: "Scenario", value: activeScenarioName },
    { label: "Kaarten", value: CARD_FILTER_LABELS[cardFilter] },
    { label: "Lijstbeleid", value: listPolicyLabel(activeList) },
  ];

  return (
    <section
      aria-label="Effectieve trainingsscope"
      className={[
        "rounded-2xl border border-slate-200 bg-white/75 p-3 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900/60",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Effectieve trainingsscope
          </p>
          {showFooterSelectorHint ? (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              De lijstkeuze in de footer wijzigt wat normale training gebruikt.
            </p>
          ) : null}
        </div>
      </div>
      <dl className="mt-2 grid gap-2 sm:grid-cols-4">
        {summaryItems.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {item.label}
            </dt>
            <dd className="truncate font-semibold text-slate-900 dark:text-white">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
