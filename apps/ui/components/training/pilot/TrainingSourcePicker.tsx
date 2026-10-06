import React, { useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSetupOption } from "@/lib/training/setups/availability";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import type { TrainingSessionSize } from "@/lib/types";
import s from "./trainingSourcePicker.module.css";
import { Search, BookOpen, Layers, Check } from "lucide-react";
export function TrainingSourcePicker({
  locale,
  lists,
  dictionaries,
  draft,
  onChange,
  disabled = false,
}: {
  locale: OnboardingLanguage;
  lists: TrainingSetupOption[];
  dictionaries: TrainingSetupOption[];
  draft: TrainingSetupDraft & { sessionSize: TrainingSessionSize };
  onChange: React.Dispatch<
    React.SetStateAction<
      TrainingSetupDraft & { sessionSize: TrainingSessionSize }
    >
  >;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all");
  const labels =
    locale === "ru"
      ? ["Все", "Словари", "Коллекции", "Поиск источников", "Нет совпадений"]
      : locale === "nl"
        ? [
            "Alles",
            "Woordenboeken",
            "Collecties",
            "Bronnen zoeken",
            "Geen resultaten",
          ]
        : [
            "All",
            "Dictionaries",
            "Collections",
            "Search sources",
            "No matches",
          ];
  const entries = [
    ...dictionaries.map((x) => ({ ...x, kind: "dictionary" })),
    ...lists.map((x) => ({ ...x, kind: "collection" })),
  ];
  const large = entries.length > 10;
  const searching = search && large;
  const visible = entries.filter(
    (x) =>
      (!searching || kind === "all" || kind === x.kind) &&
      (!searching ||
        x.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
  );
  return (
    <div className={s.source}>
      <div className={s.source_toolbar}>
        {large && (
          <button
            disabled={disabled}
            type="button"
            aria-label={labels[3]}
            aria-expanded={search}
            onClick={() => setSearch(!search)}
          >
            <Search size={15} />
          </button>
        )}
        {searching && (
          <>
            <input
              disabled={disabled}
              aria-label={labels[3]}
              placeholder={labels[3]}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              disabled={disabled}
              aria-label={labels[0]}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {["all", "dictionary", "collection"].map((k, i) => (
                <option key={k} value={k}>
                  {labels[i]}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      <div className={s.source_list}>
        {visible.map((x) => {
          const active =
            x.kind === "dictionary"
              ? draft.materialMode === "all-dictionaries" ||
                (draft.materialMode === "selected-dictionaries" &&
                  draft.dictionaryIds?.includes(x.value))
              : draft.materialMode === "collection" &&
                draft.listValue === x.value;
          return (
            <button
              disabled={disabled}
              type="button"
              key={x.kind + ":" + x.value}
              aria-label={x.label}
              aria-pressed={Boolean(active)}
              onClick={() =>
                onChange((d) =>
                  x.kind === "collection"
                    ? { ...d, materialMode: "collection", listValue: x.value }
                    : {
                        ...d,
                        materialMode: "selected-dictionaries",
                        dictionaryIds:
                          d.materialMode === "selected-dictionaries" &&
                          d.dictionaryIds?.includes(x.value)
                            ? d.dictionaryIds.filter((id) => id !== x.value)
                            : [
                                ...(d.materialMode === "selected-dictionaries"
                                  ? (d.dictionaryIds ?? [])
                                  : []),
                                x.value,
                              ],
                      },
                )
              }
            >
              {x.kind === "dictionary" ? (
                <BookOpen size={14} />
              ) : (
                <Layers size={14} />
              )}
              <span>{x.label}</span>
              <small>{x.kind === "dictionary" ? labels[1] : labels[2]}</small>
              {active && <Check size={14} />}
            </button>
          );
        })}
        {!visible.length && <p>{labels[4]}</p>}
      </div>
    </div>
  );
}
