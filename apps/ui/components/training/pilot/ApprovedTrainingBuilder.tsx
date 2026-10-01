"use client";
import React, { useId, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  Check,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { toggleNounArticle } from "@/components/practice/ui/NounArticleChoices";
import { BuilderSection } from "@/components/practice/builder/BuilderSection";
import { BuilderChoice } from "@/components/practice/builder/BuilderChoice";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import {
  formatExerciseCount,
  getPartOfSpeechLabel,
  getUiMessages,
  formatUiCount,
} from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import type { TrainingSetupOption } from "@/lib/training/setups/availability";
import type {
  DutchTrainingPartOfSpeech,
  TrainingDateWindow,
  TrainingExerciseFamily,
  TrainingMode,
  TrainingSessionSize,
} from "@/lib/types";
import { TrainingMixPicker } from "./TrainingMixPicker";
import { TrainingSessionSizePicker } from "./TrainingSessionSizePicker";
import s from "./approvedTrainingBuilder.module.css";

type Props = {
  interfaceLanguage: OnboardingLanguage;
  draft: TrainingSetupDraft & { sessionSize: TrainingSessionSize };
  languageCode: string;
  languageOptions: TrainingSetupOption[];
  lists: TrainingSetupOption[];
  dictionaries: TrainingSetupOption[];
  sources: TrainingSetupOption[];
  scenarios: TrainingSetupOption[];
  languagePending: boolean;
  dictionariesLoading: boolean;
  translationLanguage: string | null | undefined;
  name: string;
  onNameChange: (name: string) => void;
  onLanguageChange: (language: string) => void;
  onDraftChange: React.Dispatch<
    React.SetStateAction<
      TrainingSetupDraft & { sessionSize: TrainingSessionSize }
    >
  >;
  onSelectFamily: (family: TrainingExerciseFamily) => void;
  onToggleMode: (mode: TrainingMode) => void;
  onMixChange: (index: number) => void;
  onBack: () => void;
  onSave: () => Promise<boolean>;
  onBeginSave: () => void;
  onStart: () => void;
  saveDisabled: boolean;
  startDisabled: boolean;
  saveLabel: string;
  startLabel: string;
  canSave: boolean;
  notice?: React.ReactNode;
  saveNotice?: string;
  accountControls?: React.ReactNode;
};
const parts: DutchTrainingPartOfSpeech[] = [
  "zn",
  "ww",
  "bn",
  "bw",
  "vnw",
  "vz",
  "vw",
  "tw",
  "lidw",
  "tsw",
  "afk",
];
const partKeys: Partial<
  Record<
    DutchTrainingPartOfSpeech,
    | "Nouns"
    | "Verbs"
    | "Adjectives"
    | "Adverbs"
    | "Pronouns"
    | "Prepositions"
    | "Conjunctions"
    | "Numerals"
    | "Articles"
    | "Interjections"
  >
> = {
  zn: "Nouns",
  ww: "Verbs",
  bn: "Adjectives",
  bw: "Adverbs",
  vnw: "Pronouns",
  vz: "Prepositions",
  vw: "Conjunctions",
  tw: "Numerals",
  lidw: "Articles",
  tsw: "Interjections",
};
/** Controlled presentation: the production controller retains catalog, draft and start ownership. */
export function ApprovedTrainingBuilder(p: Props) {
  const messages = getUiMessages(p.interfaceLanguage),
    b = messages.builder,
    o = messages.trainingOverview,
    c = messages.trainingBuilder;
  const ratioLabel = (n: number) =>
    formatUiCount(p.interfaceLanguage, n, b, "ratio");
  const uid = useId();
  const [open, setOpen] = useState<string[]>([]),
    [languageQuery, setLanguageQuery] = useState(""),
    [sourceQuery, setSourceQuery] = useState("");
  const [nounAnchor, setNounAnchor] = useState<React.CSSProperties>({});
  const [nounOpen, setNounOpen] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [saving, setSaving] = useState(false);
  const toggle = (key: string) => {
    setOpen((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
    if (key === "filters") setNounOpen(false);
  };
  const language = (code: string) =>
    new Intl.DisplayNames([p.interfaceLanguage], { type: "language" }).of(
      code,
    ) ?? code.toUpperCase();
  const family = p.draft.family ?? "meaning";
  const familyName =
    family === "idiom"
      ? o.exerciseType.Idioms
      : family === "sentence"
        ? o.exerciseType.Translation
        : family === "word-in-context"
          ? c.wordInContext
          : o.exerciseType.Words;
  const direction = p.draft.modes
    .map((mode) =>
      mode === "word-to-definition"
        ? o.direction.Direct
        : mode === "definition-to-word"
          ? o.direction.Reverse
          : p.scenarios.find((item) => item.value === p.draft.scenarioId)
              ?.label,
    )
    .filter(Boolean)
    .join(" + ");
  const balance =
    p.draft.cardFilter === "review"
      ? c.reviewsOnly
      : p.draft.cardFilter === "new"
        ? c.newOnly
        : ratioLabel(p.draft.newReviewRatio);
  const materialMode = p.draft.materialMode ?? "collection";
  const material =
    materialMode === "all-dictionaries"
      ? c.allDictionaries
      : materialMode === "selected-dictionaries"
        ? (p.draft.dictionaryIds ?? [])
            .map(
              (id) => p.dictionaries.find((item) => item.value === id)?.label,
            )
            .filter(Boolean)
            .join(", ") || c.selectDictionary
        : p.lists.find((item) => item.value === p.draft.listValue)?.label ||
          c.materialUnavailable;
  const partName = (part: DutchTrainingPartOfSpeech) =>
    partKeys[part]
      ? b.parts[partKeys[part]!]
      : getPartOfSpeechLabel(p.interfaceLanguage, part);
  const partSummary = [
    p.draft.partOfSpeech?.length
      ? p.draft.partOfSpeech.map(partName).join(" · ")
      : b.allParts,
    p.draft.nounArticles?.join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");
  const size = p.draft.sessionSize ?? 10;
  const section = (
    key: string,
    title: string,
    summary: React.ReactNode,
    children: React.ReactNode,
  ) => (
    <BuilderSection
      id={`${uid}-${key}`}
      title={title}
      summary={summary}
      open={open.includes(key)}
      onToggle={() => toggle(key)}
    >
      {children}
    </BuilderSection>
  );
  const search = (
    value: string,
    setValue: (query: string) => void,
    label: string,
  ) => (
    <label className={s.search}>
      <Search size={16} aria-hidden="true" />
      <input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
  const matches = (option: TrainingSetupOption, query: string) =>
    `${option.label} ${option.value}`
      .toLocaleLowerCase(p.interfaceLanguage)
      .includes(query.trim().toLocaleLowerCase(p.interfaceLanguage));
  const togglePart = (part: DutchTrainingPartOfSpeech) =>
    p.onDraftChange((current) => {
      const selected = current.partOfSpeech ?? [];
      const next = selected.includes(part)
        ? selected.filter((item) => item !== part)
        : [...selected, part];
      return {
        ...current,
        partOfSpeech: next,
        nounArticles: next.includes("zn") ? (current.nounArticles ?? []) : [],
      };
    });
  const scenario = p.scenarios.find(
    (item) => item.value === p.draft.scenarioId,
  );
  const row = (
    option: TrainingSetupOption,
    active: boolean,
    onClick: () => void,
  ) => (
    <button
      key={option.value}
      type="button"
      className={s.option}
      aria-pressed={active}
      disabled={p.languagePending}
      onClick={onClick}
    >
      <span>{option.label}</span>
      <span aria-hidden="true">{active && <Check size={14} />}</span>
    </button>
  );
  const save = async () => {
    setSaving(true);
    try {
      if (await p.onSave()) setSaveOpen(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className={`${theme.theme} ${s.builder}`}
      data-colour-mode="app"
      lang={p.interfaceLanguage}
    >
      <div className={s.viewport}>
        <div className={s.main}>
          <header className={s.header}>
            <button type="button" aria-label={b.back} onClick={p.onBack}>
              <ArrowLeft size={20} />
            </button>
            <h1>{b.title}</h1>
          </header>
          {section(
            "language",
            b.language,
            language(p.languageCode),
            <>
              {search(
                languageQuery,
                setLanguageQuery,
                getUiMessages(p.interfaceLanguage).builderScope.searchLanguages,
              )}
              <div className={s.options}>
                {p.languageOptions
                  .map((option) => ({
                    ...option,
                    label: language(option.value),
                  }))
                  .filter((option) => matches(option, languageQuery))
                  .map((option) =>
                    row(option, option.value === p.languageCode, () =>
                      p.onLanguageChange(option.value),
                    ),
                  )}
              </div>
              {!p.languageOptions.some((option) =>
                matches(
                  { ...option, label: language(option.value) },
                  languageQuery,
                ),
              ) && (
                <p className={s.help}>
                  {
                    getUiMessages(p.interfaceLanguage).builderScope.noMatches
                      .language
                  }
                </p>
              )}
            </>,
          )}
          {section(
            "source",
            b.source,
            material,
            <>
              <div className={s.choices}>
                {(
                  [
                    "collection",
                    "all-dictionaries",
                    "selected-dictionaries",
                  ] as const
                ).map((mode) => (
                  <BuilderChoice
                    key={mode}
                    disabled={p.languagePending}
                    active={materialMode === mode}
                    onClick={() => {
                      setSourceQuery("");
                      p.onDraftChange((current) => ({
                        ...current,
                        materialMode: mode,
                      }));
                    }}
                  >
                    {mode === "collection"
                      ? c.collectionMode
                      : mode === "all-dictionaries"
                        ? c.allDictionaries
                        : c.chosenDictionaries}
                  </BuilderChoice>
                ))}
              </div>
              {materialMode !== "all-dictionaries" &&
                search(
                  sourceQuery,
                  setSourceQuery,
                  getUiMessages(p.interfaceLanguage).builderScope.searchSources,
                )}
              {p.dictionariesLoading && materialMode !== "collection" && (
                <p role="status" className={s.help}>
                  {c.loadingDictionaries}
                </p>
              )}
              <div className={s.options}>
                {(materialMode === "collection"
                  ? p.lists
                  : materialMode === "selected-dictionaries"
                    ? p.dictionaries
                    : []
                )
                  .filter((option) => matches(option, sourceQuery))
                  .map((option) =>
                    row(
                      option,
                      materialMode === "collection"
                        ? p.draft.listValue === option.value
                        : Boolean(
                            p.draft.dictionaryIds?.includes(option.value),
                          ),
                      () =>
                        p.onDraftChange((current) =>
                          materialMode === "collection"
                            ? { ...current, listValue: option.value }
                            : {
                                ...current,
                                dictionaryIds: current.dictionaryIds?.includes(
                                  option.value,
                                )
                                  ? current.dictionaryIds.filter(
                                      (id) => id !== option.value,
                                    )
                                  : [
                                      ...(current.dictionaryIds ?? []),
                                      option.value,
                                    ],
                              },
                        ),
                    ),
                  )}
              </div>
              {materialMode === "selected-dictionaries" &&
                (p.draft.dictionaryIds ?? []).some(
                  (id) => !p.dictionaries.some((option) => option.value === id),
                ) &&
                !p.dictionariesLoading && (
                  <p role="status" className={s.help}>
                    {c.partialDictionaryAccess}
                  </p>
                )}
            </>,
          )}
          {section(
            "exercises",
            b.exercises,
            `${familyName} · ${direction} · ${b.answerModes["Reveal & self-rate"]}`,
            <>
              <div className={s.field}>
                <h2>{b.exerciseType}</h2>
                <div className={s.choices}>
                  {(
                    ["meaning", "idiom", "sentence", "word-in-context"] as const
                  ).map((value) => (
                    <BuilderChoice
                      key={value}
                      active={family === value}
                      disabled={
                        !p.scenarios.some(
                          (item) =>
                            item.value ===
                            (value === "idiom"
                              ? "idiom"
                              : value === "sentence"
                                ? "sentences"
                                : "understanding"),
                        ) ||
                        (value === "word-in-context" &&
                          p.translationLanguage === null)
                      }
                      onClick={() => p.onSelectFamily(value)}
                    >
                      {value === "idiom"
                        ? o.exerciseType.Idioms
                        : value === "sentence"
                          ? o.exerciseType.Translation
                          : value === "word-in-context"
                            ? c.wordInContext
                            : o.exerciseType.Words}
                    </BuilderChoice>
                  ))}
                </div>
              </div>
              {family === "word-in-context" &&
                p.translationLanguage === null && (
                  <p className={s.help}>{c.contextLanguageNeeded}</p>
                )}
              <div className={s.field}>
                <h2>{b.direction}</h2>
                <div className={s.directions}>
                  {(["word-to-definition", "definition-to-word"] as const)
                    .filter(
                      (mode) =>
                        ((family !== "sentence" &&
                          family !== "word-in-context") ||
                          mode === "definition-to-word") &&
                        scenario?.modes?.includes(mode),
                    )
                    .map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        className={s.direction}
                        aria-pressed={p.draft.modes.includes(mode)}
                        onClick={() => p.onToggleMode(mode)}
                      >
                        <span className={s.directionHeading}>
                          {mode === "word-to-definition"
                            ? o.direction.Direct
                            : o.direction.Reverse}
                          <span aria-hidden="true">
                            {p.draft.modes.includes(mode) ? (
                              <Check size={12} />
                            ) : null}
                          </span>
                        </span>
                        <span className={s.prompt}>
                          {mode === "word-to-definition"
                            ? family === "idiom"
                              ? o.exerciseType.Idioms
                              : o.exerciseType.Words
                            : family === "sentence"
                              ? p.translationLanguage
                                ? language(p.translationLanguage)
                                : b.chooseTranslation
                              : c.meaning}
                        </span>
                        <ArrowDown size={15} aria-hidden="true" />
                        <span className={s.answer}>
                          {mode === "word-to-definition"
                            ? c.meaning
                            : family === "sentence"
                              ? language(p.languageCode)
                              : family === "idiom"
                                ? o.exerciseType.Idioms
                                : o.exerciseType.Words}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
              <div className={s.field}>
                <h2>{b.answerMode}</h2>
                <div className={s.choices}>
                  <BuilderChoice active onClick={() => undefined}>
                    {b.answerModes["Reveal & self-rate"]}
                  </BuilderChoice>
                  <BuilderChoice active={false} disabled>
                    {b.answerModes["Type the answer"]}
                  </BuilderChoice>
                </div>
              </div>
            </>,
          )}
          {section(
            "filters",
            b.filters,
            partSummary,
            <>
              <div className={s.field}>
                <h2>{b.partOfSpeech}</h2>
                {p.languageCode !== "nl" ? (
                  <p className={s.help}>{b.lexicalUnavailable}</p>
                ) : (
                  <div className={s.choices}>
                    {parts.map((part) =>
                      part === "zn" ? (
                        <div className={s.nounChoice} key={part}>
                          <BuilderChoice
                            active={Boolean(
                              p.draft.partOfSpeech?.includes(part),
                            )}
                            onClick={() => togglePart(part)}
                          >
                            {partName(part)}
                            {Boolean(p.draft.nounArticles?.length) && (
                              <span
                                className={s.dot}
                                aria-hidden="true"
                                title={b.subfiltersActive}
                              />
                            )}
                          </BuilderChoice>
                          <button
                            type="button"
                            aria-label={b.nounSubfilters}
                            aria-expanded={nounOpen}
                            onClick={(event) => {
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              setNounAnchor({
                                "--noun-left": `${rect.left}px`,
                                "--noun-top": `${rect.bottom + 8}px`,
                              } as React.CSSProperties);
                              setNounOpen(true);
                            }}
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      ) : (
                        <BuilderChoice
                          key={part}
                          active={Boolean(p.draft.partOfSpeech?.includes(part))}
                          onClick={() => togglePart(part)}
                        >
                          {partName(part)}
                        </BuilderChoice>
                      ),
                    )}
                  </div>
                )}
              </div>
              <details className={s.activity}>
                <summary>{c.activity}</summary>
                <p className={s.help}>{c.activityHelp}</p>
                <label className={s.field}>
                  {c.source}
                  <select
                    aria-label={c.source}
                    value={p.draft.sourceValue}
                    onChange={(event) =>
                      p.onDraftChange((current) => ({
                        ...current,
                        sourceValue: event.target.value,
                      }))
                    }
                  >
                    <option value="all">{c.allSources}</option>
                    <option value="kind:youtube">{c.youtube}</option>
                    {p.sources.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>
                  {c.date}
                  <select
                    aria-label={c.date}
                    value={p.draft.dateWindow}
                    onChange={(event) =>
                      p.onDraftChange((current) => ({
                        ...current,
                        dateWindow: event.target.value as TrainingDateWindow,
                      }))
                    }
                  >
                    {(["all", "today", "yesterday", "daysAgo"] as const).map(
                      (value) => (
                        <option key={value} value={value}>
                          {value === "all"
                            ? c.allDates
                            : value === "today"
                              ? c.today
                              : value === "yesterday"
                                ? c.yesterday
                                : c.daysAgo}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                {p.draft.dateWindow === "daysAgo" && (
                  <input
                    className={s.input}
                    aria-label={c.daysAgo}
                    type="number"
                    min={1}
                    max={365}
                    value={p.draft.daysAgo ?? 7}
                    onChange={(event) =>
                      p.onDraftChange((current) => ({
                        ...current,
                        daysAgo: Math.max(
                          1,
                          Math.min(365, Number(event.target.value) || 1),
                        ),
                      }))
                    }
                  />
                )}
              </details>
            </>,
          )}
          {section(
            "session",
            b.session,
            `${size === "all-due-today" ? c.allDueToday : formatExerciseCount(p.interfaceLanguage, size)} · ${balance}`,
            <div className={s.sessionFields}>
              <TrainingSessionSizePicker
                approved
                value={size}
                onChange={(sessionSize) =>
                  p.onDraftChange((current) => ({
                    ...current,
                    sessionSize,
                    ...(sessionSize === "all-due-today"
                      ? { cardFilter: "review" as const }
                      : {}),
                  }))
                }
                label={b.sessionSize}
                exercisesLabel={(count) =>
                  formatExerciseCount(p.interfaceLanguage, count)
                }
                allDueLabel={c.allDueToday}
                allDueHelp={c.allDueHelp}
                allowAllDueToday={family === "meaning"}
              />
              <TrainingMixPicker
                approved
                cardFilter={p.draft.cardFilter}
                ratio={p.draft.newReviewRatio}
                onChange={p.onMixChange}
                label={b.balanceLabel}
                reviewsOnly={c.reviewsOnly}
                newOnly={c.newOnly}
                ratioLabel={ratioLabel}
                help={c.mixHelp}
              />
            </div>,
          )}
          {p.accountControls}
          {p.notice && <div className={s.notice}>{p.notice}</div>}
        </div>
      </div>
      <footer className={s.footer}>
        <div>
          {p.canSave && (
            <button
              type="button"
              className={s.secondary}
              disabled={p.saveDisabled}
              onClick={() => {
                p.onBeginSave();
                setSaveOpen(true);
              }}
            >
              {p.saveLabel}
            </button>
          )}
          <button
            type="button"
            className={s.primary}
            disabled={p.startDisabled}
            onClick={p.onStart}
          >
            {p.startLabel}
          </button>
        </div>
      </footer>
      {nounOpen && (
        <DialogSurface
          className={`${s.dialog} ${s.nounDialog}`}
          style={nounAnchor}
          aria-labelledby={`${uid}-noun-title`}
          onDismiss={() => setNounOpen(false)}
        >
          <header>
            <h2 id={`${uid}-noun-title`}>{b.nounArticle}</h2>
            <button
              type="button"
              aria-label={b.closeNounSubfilters}
              onClick={() => setNounOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div className={s.choices}>
            {(["de", "het"] as const).map((article) => (
              <BuilderChoice
                key={article}
                active={Boolean(p.draft.nounArticles?.includes(article))}
                onClick={() =>
                  p.onDraftChange((current) => ({
                    ...current,
                    partOfSpeech: current.partOfSpeech?.length
                      ? Array.from(
                          new Set([...current.partOfSpeech, "zn" as const]),
                        )
                      : current.partOfSpeech,
                    nounArticles: toggleNounArticle(current.nounArticles ?? [], article),
                  }))
                }
              >
                {article}
              </BuilderChoice>
            ))}
          </div>
        </DialogSurface>
      )}
      {saveOpen && (
        <DialogSurface
          className={s.dialog}
          aria-labelledby={`${uid}-save-title`}
          onDismiss={() => {
            if (!saving) setSaveOpen(false);
          }}
        >
          <h2 id={`${uid}-save-title`}>{p.saveLabel}</h2>
          <label className={s.field}>
            {b.trainingName}
            <input
              autoFocus
              disabled={saving}
              className={s.input}
              aria-label={b.trainingName}
              maxLength={160}
              value={p.name}
              onChange={(event) => p.onNameChange(event.target.value)}
              placeholder={b.namePlaceholder}
            />
          </label>
          {p.saveNotice && (
            <p role="status" className={s.help}>
              {p.saveNotice}
            </p>
          )}
          <div className={s.dialogActions}>
            <button
              type="button"
              className={s.secondary}
              disabled={saving}
              onClick={() => setSaveOpen(false)}
            >
              {b.cancel}
            </button>
            <button
              type="button"
              className={s.primary}
              disabled={saving || p.saveDisabled}
              onClick={() => void save()}
            >
              {p.saveLabel}
            </button>
          </div>
        </DialogSurface>
      )}
    </div>
  );
}
