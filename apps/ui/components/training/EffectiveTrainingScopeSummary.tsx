import { localizedSection, formatMessage } from "@/lib/i18n/catalog";
import type { InterfaceLanguage } from "@/lib/i18n/registry";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import React from "react";
import type { CardFilter, TrainingMode, WordListSummary } from "@/lib/types";

type Props = {
  activeList: WordListSummary | null;
  activeScenarioName: string;
  cardFilter: CardFilter;
  language?: string;
  interfaceLanguage?: InterfaceLanguage;
  className?: string;
  showFooterSelectorHint?: boolean;
};

export function EffectiveTrainingScopeSummary({
  activeList,
  activeScenarioName,
  cardFilter,
  language,
  interfaceLanguage = "nl",
  className,
  showFooterSelectorHint = false,
}: Props) {
  const copy = localizedSection("trainingScope")[interfaceLanguage];
  const labels = localizedSection("sessionLabels")[interfaceLanguage];
  const activeListName = activeList?.name ?? copy.noList;
  const learningLanguage = language ? languageDisplayName(interfaceLanguage, language) : null;
  const compactSummary = formatMessage(copy.current, {summary: [learningLanguage, activeListName, activeScenarioName, labels.filter[cardFilter]].filter(Boolean).join(" · ")});
  const defaultId = activeList?.default_scenario_id;
  const scenario = defaultId ? labels.scenario[defaultId as keyof typeof labels.scenario] ?? defaultId : null;
  const modes = (activeList?.card_type_ids ?? []).map(mode => labels.mode[mode as TrainingMode] ?? mode).join(", ") || copy.noModes;
  const policy = activeList?.card_policy;
  const policyDetails = !activeList ? copy.noList
    : policy === "restrict" ? formatMessage(scenario ? copy.restrictedDefault : copy.restricted, {scenario: scenario ?? "", modes})
    : policy === "prefer" ? formatMessage(scenario ? copy.preferredDefault : copy.preferred, {scenario: scenario ?? "", modes})
    : scenario ? formatMessage(copy.defaultScenario, {scenario}) : copy.noDefault;

  return (
    <section
      aria-label={copy.title}
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
              ? `${policyDetails}. ${copy.footerHint}`
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
