"use client";
import { localizedField, localizedSection } from "@/lib/i18n/catalog";

import {FrequencyProfileIcon} from "@/components/practice/vocabulary/FrequencyProfileIcon";
import {AdaptiveFilterSummary} from "./AdaptiveFilterSummary";
import {VocabularySelectionFields} from "@/components/practice/vocabulary/VocabularySelectionFields";
import {PartOfSpeechSelection} from "@/components/practice/vocabulary/PartOfSpeechSelection";
import {MaterialKindSelection,MaterialKindHelp,materialKindSummary} from "@/components/practice/vocabulary/MaterialKindSelection";
import {DEFAULT_VOCABULARY_SELECTION} from "@/lib/vocabulary/selection";
import {partCode,partId,VOCABULARY_PART_LABELS} from "@/lib/vocabulary/partsOfSpeech";
import {SessionMix,SessionSizeIcon} from "./SessionSummaryIcons";
import {DirectionIcon,SourceWordIcon} from "./ExerciseSummaryIcons";
import {SourceWordSelection} from "./SourceWordSelection";
import {usesSourceWordSelection} from "@/lib/training/sourceWordSelection";
import {SettingsHelp} from "@/components/practice/settings/SettingsHelp";
import {TrainingAvailabilityStrip} from "./TrainingAvailabilityStrip";
import type {TrainingAvailabilityState} from "@/lib/training/availability/useTrainingAvailability";
import {signalOnboarding} from "@/lib/onboarding/signals";
import { SegmentedControl } from "@/components/practice/ui/SegmentedControl";
import React, { useId, useState, useRef, useLayoutEffect } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Trash2,
  X,
  Pencil,
  ListOrdered,
} from "lucide-react";
import {
  singleNounArticle,
} from "@/lib/training/nounArticles";
import { DirectionCard } from "@/components/practice/builder/DirectionCard";
import { directionExample } from "@/lib/training/directionExamples";
import { BuilderSection } from "@/components/practice/builder/BuilderSection";
import { BuilderChoice } from "@/components/practice/builder/BuilderChoice";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import actions from "@/components/practice/ui/launchAction.module.css";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import {
  formatUiMessage,
  getPartOfSpeechLabel,
  getUiMessages,
  formatUiCount,
} from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import type { TrainingSetupOption } from "@/lib/training/setups/availability";
import type {
  DutchTrainingPartOfSpeech,
  TrainingExerciseFamily,
  TrainingMode,
  TrainingSessionSize,
} from "@/lib/types";
import { exerciseSummary } from "@/lib/training/exerciseSummary";
import { TrainingSourcePicker } from "./TrainingSourcePicker";
import { TrainingMixPicker } from "@/components/training/pilot/TrainingMixPicker";
import { TrainingSessionSizePicker } from "@/components/training/pilot/TrainingSessionSizePicker";
import s from "@/components/training/pilot/approvedTrainingBuilder.module.css";

type Props = {
  initialSection?: "session";
  availability?:TrainingAvailabilityState;
  onAvailabilityRetry?:()=>void;
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
  editing?: boolean;
  hasUnsavedChanges?: boolean;
  onSaveAs?: (newName: string) => Promise<boolean>;
  onDelete?: () => boolean | Promise<boolean>;
  deletionChangesMain?: boolean;
  deleteDisabled?: boolean;
  saveAsLabel?: string;
  deleteLabel?: string;
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
/** Controlled presentation: the production controller retains catalog, draft and start ownership. */
export function ApprovedTrainingBuilder(p: Props) {
  const messages = getUiMessages(p.interfaceLanguage),
    b = messages.builder,
    o = messages.trainingOverview,
    c = messages.trainingBuilder;
  const ratioLabel = (n: number) =>
    formatUiCount(p.interfaceLanguage, n, b, "ratio");
  const saveAsLabel =
    p.saveAsLabel ??
    localizedField("trainingBuilderActions", "saveAs")[
      p.interfaceLanguage
    ];
  const deleteLabel =
    p.deleteLabel ??
    localizedField("trainingBuilderActions", "delete")[p.interfaceLanguage];
  const uid = useId();
  const builderRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = builderRef.current;
    if (!node) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const save = node.querySelector<HTMLButtonElement>(
        `.${s.updateGroup}>button`,
      );
      if (!save) return;
      const span = document.createElement("span");
      Object.assign(span.style, {
        position: "absolute",
        visibility: "hidden",
        whiteSpace: "nowrap",
        font: getComputedStyle(save).font,
      });
      node.append(span);
      span.textContent = p.saveLabel;
      const saveWidth = span.getBoundingClientRect().width + 63;
      span.textContent = p.startLabel;
      const startWidth = span.getBoundingClientRect().width + 24;
      span.remove();
      node.style.setProperty(
        "--builder-action-width",
        Math.ceil(Math.max(168, saveWidth, startWidth)) + "px",
      );
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [p.saveLabel, p.startLabel]);
  const [open, setOpen] = useState<string[]>(p.initialSection?[p.initialSection]:[]);
  useLayoutEffect(() => {
    if (p.initialSection !== "session") return;
    const frame=requestAnimationFrame(() => builderRef.current?.querySelector<HTMLElement>(`#${CSS.escape(uid+"-session-body")}`)?.parentElement?.scrollIntoView({block:"nearest"}));
    return () => cancelAnimationFrame(frame);
  }, [p.initialSection,uid]);
  const [saveOpen, setSaveOpen] = useState(false),
    [copyOpen, setCopyOpen] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [copyName, setCopyName] = useState(""),
    [saving, setSaving] = useState(false);
  const toggle = (key: string) => {
    setOpen((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
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
        ? c.pausedSentenceLabel
        : family === "word-in-context"
          ? c.wordInContext
          : o.exerciseType.Words;
  const direction =
    family === "word-in-context"
      ? c.contextDirection
      : p.draft.modes
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
  const sourceWordCopy=localizedSection("sourceWordSelection")[p.interfaceLanguage];
  const sourceStatus=p.draft.sourceWordStatus === "all" ? "all" : "learning";
  const fullExerciseSummary=[exerciseSummary(family, familyName, direction),usesSourceWordSelection(family)?`${sourceWordCopy.title}: ${sourceWordCopy[sourceStatus]}`:null].filter(Boolean).join(" · ");
  const balance =
    p.draft.cardFilter === "review"
      ? c.reviewsOnly
      : p.draft.cardFilter === "new"
        ? c.newOnly
        : ratioLabel(p.draft.newReviewRatio);
  const materialMode = p.draft.materialMode ?? "collection";
  const material = p.draft.librarySelection?.labelId ? p.draft.librarySelection.labelName??(localizedField("trainingBuilderActions", "selectedLabel"))[p.interfaceLanguage] :
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
  const partName = (part: DutchTrainingPartOfSpeech) => {const id=partId(part);return id?b.parts[VOCABULARY_PART_LABELS[id]]:getPartOfSpeechLabel(p.interfaceLanguage,part);};
  const partSummary = [
    p.draft.partOfSpeech?.length
      ? p.draft.partOfSpeech.map(partName).join(" · ")
      : b.allParts,
    singleNounArticle(p.draft.nounArticles ?? []),
  ]
    .filter(Boolean)
    .join(" · ");
  const abbreviations=localizedSection("vocabularyPartShort")[p.interfaceLanguage];
  const abbreviatedParts=[p.draft.partOfSpeech?.length ? p.draft.partOfSpeech.map(part=>{const id=partId(part);return id?abbreviations[id]:partName(part);}).join(" · ") : b.allParts,singleNounArticle(p.draft.nounArticles??[])].filter(Boolean).join(" · ");
  const vocabulary=p.draft.vocabulary??DEFAULT_VOCABULARY_SELECTION;
  const vcopy=localizedSection("vocabularySelection")[p.interfaceLanguage];
  const partCount=p.draft.partOfSpeech?.length??0;
  const shortParts=partCount?[formatUiMessage(vcopy.partsSelected,{count:partCount}),singleNounArticle(p.draft.nounArticles??[])].filter(Boolean).join(" · "):b.allParts;
  const selectedKind=vocabulary.materialKinds.length?materialKindSummary(vocabulary.materialKinds,p.interfaceLanguage):null;
  const otherKind=vocabulary.materialKinds.includes("other");
  const filterParts=otherKind?selectedKind!:[selectedKind,abbreviatedParts].filter(Boolean).join(" · ");
  const accessibleFilterParts=otherKind?selectedKind!:[selectedKind,partSummary].filter(Boolean).join(" · ");
  const shortFilterParts=otherKind?selectedKind!:[selectedKind,shortParts].filter(Boolean).join(" · ");
  const frequencyRange=vocabulary.mode==="frequency"?(vocabulary.from===1?formatUiMessage(vcopy.top,{count:vocabulary.to.toLocaleString(p.interfaceLanguage)}):`${vocabulary.from.toLocaleString(p.interfaceLanguage)}–${vocabulary.to.toLocaleString(p.interfaceLanguage)}`):null;
  const meaningSummary=vocabulary.meanings==="all"?null:vocabulary.meanings===1?vcopy.firstMeaning:formatUiCount(p.interfaceLanguage,vocabulary.meanings,vcopy,"firstMeanings");
  const vocabularySummary=frequencyRange;
  const accessibleVocabularySummary=[frequencyRange?(vocabulary.profile==="spoken"?vcopy.spoken:vcopy.written):null,frequencyRange,meaningSummary].filter(Boolean).join(" · ");
  const [partsExpanded,setPartsExpanded]=useState(false);
  const activityScope = [
    p.draft.sourceValue !== "all"
      ? p.sources.find(option => option.value === p.draft.sourceValue)?.label ??
        (p.draft.sourceValue === "kind:youtube" ? c.youtube : localizedField("trainingBuilderActions", "savedSource")[p.interfaceLanguage])
      : null,
    p.draft.dateWindow !== "all"
      ? p.draft.dateWindow === "today" ? c.today
        : p.draft.dateWindow === "yesterday" ? c.yesterday
          : `${c.daysAgo}: ${p.draft.daysAgo ?? 7}`
      : null,
  ].filter(Boolean).join(" · ");
  const size = p.draft.sessionSize ?? 10;
  const section = (
    key: string,
    title: string,
    summary: React.ReactNode,
    children: React.ReactNode,
    headerActions?: React.ReactNode,
  ) => (
    <BuilderSection
      id={`${uid}-${key}`}
      title={title}
      summary={summary}
      headerActions={headerActions}
      open={open.includes(key)}
      onToggle={() => toggle(key)}
    >
      {children}
    </BuilderSection>
  );
  const scenario = p.scenarios.find(
    (item) => item.value === p.draft.scenarioId,
  );
  const save = async () => {
    setSaving(true);
    try {
      if (copyOpen ? await p.onSaveAs?.(copyName.trim()) : await p.onSave()) {
        signalOnboarding("training-saved");
        setSaveOpen(false);
        setCopyOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      data-onboarding="builder" data-material-mode={p.draft.materialMode ?? "selected-dictionaries"} ref={builderRef}
      className={`${theme.theme} ${s.builder} session-builder-standard`}
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
          {
            <TrainingName
              label={b.trainingName}
              name={p.name}
              onChange={p.onNameChange}
              disabled={saving}
            />
          }
          {activityScope && <p className={`${s.help} ${s.activityNotice}`}>
            {formatUiMessage(localizedField("trainingBuilderActions", "activityScopeNotice")[p.interfaceLanguage],{scope:activityScope})}
          </p>}
          <div className={`${s.section_group} builder-section-group`}>
            <section className={s.inline_language}>
              <h2>{b.language}</h2>
              <SegmentedControl standard label={b.language}>
                {p.languageOptions.map((option) => (
                  <BuilderChoice
                    key={option.value}
                    active={option.value === p.languageCode}
                    disabled={p.languagePending}
                    onClick={() => p.onLanguageChange(option.value)}
                  >
                    {language(option.value)}
                  </BuilderChoice>
                ))}
              </SegmentedControl>
            </section>
            <TrainingSourcePicker
              locale={p.interfaceLanguage}
              lists={p.lists}
              dictionaries={p.dictionaries}
              draft={p.draft}
              onChange={next=>p.onDraftChange(current=>{const updated=typeof next==="function"?next(current):next;return current.librarySelection?.labelId?{...updated,librarySelection:current.librarySelection.query||current.librarySelection.languageCode?{query:current.librarySelection.query,category:current.librarySelection.category,...(current.librarySelection.languageCode?{languageCode:current.librarySelection.languageCode}:{})}:undefined}:updated;})}
              disabled={p.languagePending || p.dictionariesLoading}
              expanded={open.includes("source")}
              renderSection={({ toolbar, content }) => (
                <BuilderSection
                  id={`${uid}-source`}
                  title={b.source}
                  summary={material}
                  open={open.includes("source")}
                  onToggle={() => toggle("source")}
                  headerChoices={toolbar}
                >
                  {p.dictionariesLoading && <p role="status" className={s.help}>{c.loadingDictionaries}</p>}
                  {content}
                  {materialMode === "selected-dictionaries" &&
                    (p.draft.dictionaryIds ?? []).some(id => !p.dictionaries.some(option => option.value === id)) &&
                    !p.dictionariesLoading && <p role="status" className={s.help}>{c.partialDictionaryAccess}</p>}
                </BuilderSection>
              )}
            />
            {section(
              "exercises",
              b.exercises,
              <span className={s.exerciseSummary} title={fullExerciseSummary}>
                <span className={s.exerciseSummaryVisual} aria-hidden="true"><span>{familyName}</span>
                  {family!=="word-in-context"&&family!=="sentence"&&<DirectionIcon modes={p.draft.modes}/>}
                  {usesSourceWordSelection(family)&&<SourceWordIcon status={sourceStatus}/>}
                </span><span className={s.visuallyHidden}>{fullExerciseSummary}</span>
              </span>,
              <>
                <div className={`${s.field} ${s.filterRow}`}>
                  <h2>{b.exerciseType}</h2>
                  <SegmentedControl standard label={b.exerciseType}>
                    {(["meaning", "idiom", "word-in-context"] as const).map(
                      (value) => (
                        <BuilderChoice
                          key={value}
                          active={family === value}
                          disabled={
                            !p.scenarios.some(
                              (item) =>
                                item.value ===
                                (value === "idiom" ? "idiom" : "understanding"),
                            ) ||
                            (value === "word-in-context" &&
                              p.translationLanguage === null)
                          }
                          onClick={() => p.onSelectFamily(value)}
                        >
                          {value === "idiom"
                            ? o.exerciseType.Idioms
                            : value === "word-in-context"
                              ? c.wordInContext
                              : o.exerciseType.Words}
                        </BuilderChoice>
                      ),
                    )}
                  </SegmentedControl>
                </div>
                <div className={`${s.dynamicReveal} ${usesSourceWordSelection(family)?s.dynamicRevealOpen:""}`} aria-hidden={!usesSourceWordSelection(family)} ref={node=>{node?.toggleAttribute("inert",!usesSourceWordSelection(family))}}><div><div className={s.sourceWordReveal}><SourceWordSelection translation={family === "word-in-context"} language={p.interfaceLanguage} value={p.draft.sourceWordStatus ?? "learning"} onChange={sourceWordStatus=>p.onDraftChange(current=>({...current,sourceWordStatus}))}/></div></div></div>
                {family === "sentence" && (
                  <p role="status" className={s.help}>
                    {c.sentencePaused}
                  </p>
                )}
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
                      .map((mode) => {
                        const example = directionExample(
                          p.languageCode,
                          family,
                          p.translationLanguage,
                        );
                        const direct = mode === "word-to-definition";
                        const prompt = example
                          ? example[direct ? 0 : 1]
                          : direct
                            ? family === "idiom"
                              ? o.exerciseType.Idioms
                              : o.exerciseType.Words
                            : family === "word-in-context"
                              ? c.contextPrompt
                              : family === "sentence"
                                ? p.translationLanguage
                                  ? language(p.translationLanguage)
                                  : b.chooseTranslation
                                : c.meaning;
                        const answer = example
                          ? example[direct ? 1 : 0]
                          : direct
                            ? c.meaning
                            : family === "sentence"
                              ? language(p.languageCode)
                              : family === "idiom"
                                ? o.exerciseType.Idioms
                                : o.exerciseType.Words;
                        return (
                          <DirectionCard
                            key={mode}
                            label={
                              family === "word-in-context"
                                ? c.contextDirection
                                : direct
                                  ? o.direction.Direct
                                  : o.direction.Reverse
                            }
                            labelIcon={family!=="word-in-context"&&family!=="sentence"?<DirectionIcon modes={[mode]}/>:undefined}
                            selected={p.draft.modes.includes(mode)}
                            onClick={
                              family === "word-in-context"
                                ? undefined
                                : () => p.onToggleMode(mode)
                            }
                            prompt={prompt}
                            answer={answer}
                            promptLanguage={
                              example
                                ? !direct &&
                                  (family === "sentence" ||
                                    family === "word-in-context")
                                  ? (p.translationLanguage ?? undefined)
                                  : p.languageCode
                                : undefined
                            }
                            answerLanguage={
                              example
                                ? direct &&
                                  (family === "sentence" ||
                                    family === "word-in-context")
                                  ? (p.translationLanguage ?? undefined)
                                  : p.languageCode
                                : undefined
                            }
                            classes={{
                              card: s.direction,
                              heading: s.directionHeading,
                              headingLabel: s.directionHeadingLabel,
                              check: s.directionCheck,
                              prompt: s.prompt,
                              arrow: s.directionArrow,
                              answer: s.answer,
                            }}
                          />
                        );
                      })}
                  </div>
                </div>
                <div className={s.field}>
                  <h2 className={s.helpHeading}>{b.answerMode}<SettingsHelp label={b.answerMode} text={localizedField("trainingBuilderActions", "responseModesHelp")[p.interfaceLanguage]}/></h2>
                  <SegmentedControl standard label={b.answerMode}>
                    <BuilderChoice active onClick={() => undefined}>
                      {b.answerModes["Reveal & self-rate"]}
                    </BuilderChoice>
                    <BuilderChoice active={false} disabled>
                      {b.answerModes["Type the answer"]}
                    </BuilderChoice>
                  </SegmentedControl>
                </div>
              </>,
            )}
            {section(
              "filters",
              b.filters,
              <AdaptiveFilterSummary parts={filterParts} accessibleParts={accessibleFilterParts} shortParts={shortFilterParts} suffix={vocabularySummary??undefined} meaning={meaningSummary?String(vocabulary.meanings):undefined} meaningIcon={meaningSummary?<ListOrdered size={15} aria-hidden="true"/>:undefined} suffixIcon={frequencyRange?<FrequencyProfileIcon profile={vocabulary.profile}/>:undefined} accessibleSuffix={accessibleVocabularySummary} lines={2}/>,
              <div className={s.filterFields}>
                <VocabularySelectionFields compact learningLanguage={p.languageCode} section="selection" value={p.draft.vocabulary??DEFAULT_VOCABULARY_SELECTION} language={p.interfaceLanguage} onChange={vocabulary=>p.onDraftChange(current=>({...current,vocabulary}))}/>
                <div className={`${s.field} ${s.filterRow}`}><h2>{localizedField("libraryFilters", "entryType")[p.interfaceLanguage]}<MaterialKindHelp language={p.interfaceLanguage}/></h2><MaterialKindSelection language={p.interfaceLanguage} value={p.draft.vocabulary?.materialKinds??[]} onChange={materialKinds=>p.onDraftChange(current=>({...current,vocabulary:{...(current.vocabulary??DEFAULT_VOCABULARY_SELECTION),materialKinds}}))}/></div>
                <div className={`${s.dynamicReveal} ${!p.draft.vocabulary?.materialKinds.includes("other")?s.dynamicRevealOpen:""}`} aria-hidden={Boolean(p.draft.vocabulary?.materialKinds.includes("other"))} ref={node=>{node?.toggleAttribute("inert",Boolean(p.draft.vocabulary?.materialKinds.includes("other")))}}><div><div className={s.partsSection}><button type="button" className={s.partsHeading} aria-expanded={partsExpanded} aria-controls={`${uid}-parts-body`} onClick={()=>setPartsExpanded(!partsExpanded)}><span>{b.partOfSpeech}</span><AdaptiveFilterSummary parts={abbreviatedParts} accessibleParts={partSummary} shortParts={shortParts} lines={1}/><ChevronDown size={16} className={partsExpanded?s.partsChevronOpen:s.partsChevron}/></button><div id={`${uid}-parts-body`} className={`${s.partsReveal} ${partsExpanded?s.partsRevealOpen:""}`} aria-hidden={!partsExpanded} ref={node=>{node?.toggleAttribute("inert",!partsExpanded)}}><div><PartOfSpeechSelection compact value={{parts:(p.draft.partOfSpeech??[]).map(partId).filter((id):id is NonNullable<typeof id>=>Boolean(id)),article:singleNounArticle(p.draft.nounArticles??[])}} language={p.interfaceLanguage} languageCode={p.languageCode} onChange={next=>p.onDraftChange(current=>({...current,partOfSpeech:next.parts.map(partCode),nounArticles:next.article?[next.article]:[]}))}/></div></div></div></div></div>
                <VocabularySelectionFields compact section="meanings" value={p.draft.vocabulary??DEFAULT_VOCABULARY_SELECTION} language={p.interfaceLanguage} onChange={vocabulary=>p.onDraftChange(current=>({...current,vocabulary}))}/>
                {p.draft.librarySelection&&(p.draft.librarySelection.query||p.draft.librarySelection.labelId)&&<p className={s.help}>{[p.draft.librarySelection.labelName,p.draft.librarySelection.query?`${messages.librarySearch.labels[p.draft.librarySelection.category]}: «${p.draft.librarySelection.query}»`:null].filter(Boolean).join(" · ")} <button type="button" onClick={()=>p.onDraftChange(current=>({...current,librarySelection:(!current.materialMode||current.materialMode==="collection")&&current.librarySelection?.languageCode?{languageCode:current.librarySelection.languageCode,query:"",category:"headwords"}:undefined}))}>{localizedField("trainingBuilderActions", "clearLibrarySelection")[p.interfaceLanguage]}</button></p>}
              </div>,
              <SettingsHelp label={b.filters} text={localizedField("trainingBuilderActions", "filtersHelp")[p.interfaceLanguage]}/>,
            )}
            {section(
              "session",
              b.session,
              <span className={s.sessionSummary} title={`${size === "all-due-today" ? c.allDueToday : formatUiCount(p.interfaceLanguage,size,messages.collections,"card")} · ${balance}`}><span aria-hidden="true"><span className={s.sessionIcon}><SessionSizeIcon/></span>{" "}{size === "all-due-today" ? c.allDueToday : formatUiCount(p.interfaceLanguage,size,messages.collections,"card")}{" · "}<SessionMix filter={p.draft.cardFilter} ratio={p.draft.newReviewRatio} label={balance} expanded/></span><span className={s.visuallyHidden}>{`${size === "all-due-today" ? c.allDueToday : formatUiCount(p.interfaceLanguage,size,messages.collections,"card")} · ${balance}`}</span></span>,
              <div className={s.sessionFields}>
                <TrainingSessionSizePicker
                  approved
                  value={size}
                  onChange={(sessionSize) =>
                    p.onDraftChange((current) => ({
                      ...current,
                      sessionSize,
                    }))
                  }
                  label={b.sessionSize}
                  helpText={family === "meaning" ? [localizedField("trainingBuilderActions", "sessionSizeHelp")[p.interfaceLanguage],c.allDueHelp] : localizedField("trainingBuilderActions", "sessionSizeHelp")[p.interfaceLanguage]}
                  exercisesLabel={(count) =>
                    formatUiCount(p.interfaceLanguage,count,messages.collections,"card")
                  }
                  allDueLabel={c.allDueToday}
                  allAvailableTick={localizedField("trainingBuilderActions", "all")[p.interfaceLanguage]}
                  allDueHelp={c.allDueHelp}
                  allowAllDueToday={family === "meaning"}
                />
                <TrainingMixPicker
                  approved
                  cardFilter={p.draft.cardFilter}
                  ratio={p.draft.newReviewRatio}
                  onChange={p.onMixChange}
                  label={b.balanceLabel}
                  helpText={localizedField("trainingBuilderActions", "mixChoiceHelp")[p.interfaceLanguage]}
                  reviewsOnly={c.reviewsOnly}
                  newOnly={c.newOnly}
                  ratioLabel={ratioLabel}
                  help=""
                />
              </div>,
            )}
          </div>
          {p.accountControls}
          {p.notice && <div className={s.notice}>{p.notice}</div>}
        </div>
      </div>
      <footer className={s.footer}>
        {p.availability&&<TrainingAvailabilityStrip state={p.availability} language={p.interfaceLanguage} onRetry={p.onAvailabilityRetry}/>}
        <div>
          <button
            type="button"
            className={`${s.primary} ${actions.primary}`}
            disabled={p.startDisabled}
            onClick={p.onStart}
          >
            {p.startLabel}
          </button>
          {p.canSave && (
            <div className={s.saveActions}>
              {p.editing && p.onDelete && (
                <button
                  type="button"
                  className={s.delete}
                  aria-label={deleteLabel}
                  title={deleteLabel}
                  disabled={saving || p.deleteDisabled}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 size={16} />
                  <span>{deleteLabel}</span>
                </button>
              )}
              <div className={s.updateGroup}>
                <button
                  type="button"
                  className={s.secondary}
                  data-onboarding="save-training" aria-label={p.saveLabel}
                  disabled={saving || p.saveDisabled}
                  onClick={() => {
                    p.onBeginSave();
                    if (p.editing) void save();
                    else setSaveOpen(true);
                  }}
                >
                  {p.hasUnsavedChanges && <span className={s.unsavedDot} role="status" aria-label={(localizedField("trainingBuilderActions", "unsaved"))[p.interfaceLanguage]} title={(localizedField("trainingBuilderActions", "unsaved"))[p.interfaceLanguage]} />}
                  {p.saveLabel}
                </button>
                {p.editing && p.onSaveAs && (
                  <details
                    className={s.saveMenu}
                    onKeyDown={(event) => {
                      if (event.key === "Escape")
                        event.currentTarget.removeAttribute("open");
                    }}
                    onBlur={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                        )
                      )
                        event.currentTarget.removeAttribute("open");
                    }}
                  >
                    <summary
                      aria-label={saveAsLabel}
                      aria-disabled={saving || p.saveDisabled}
                      onClick={(event) => {
                        if (saving || p.saveDisabled) event.preventDefault();
                      }}
                    >
                      <ChevronDown size={16} />
                    </summary>
                    <div className={s.saveMenuPanel}>
                      <button
                        type="button"
                        disabled={saving || p.saveDisabled}
                        onClick={(event) => {
                          const menu = event.currentTarget.closest("details");
                          menu?.removeAttribute("open");
                          menu?.querySelector("summary")?.focus();
                          p.onBeginSave();
                          setCopyName(p.name);
                          setCopyOpen(true);
                        }}
                      >
                        {saveAsLabel}
                      </button>
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}

        </div>
      </footer>
      {deleteOpen && (
        <DialogSurface
          className={s.dialog}
          lang={p.interfaceLanguage}
          aria-labelledby={`${uid}-delete-title`}
          onDismiss={() => {
            if (!saving) setDeleteOpen(false);
          }}
        >
          <h2 id={`${uid}-delete-title`}>{b.deleteTitle}</h2>
          <p className={s.help}>
            {formatUiMessage(b.deleteNotice, { name: p.name })}
          </p>
          {p.deletionChangesMain && <p className={s.help}>{b.nextMain}</p>}
          <div className={s.dialogActions}>
            <button
              type="button"
              className={s.secondary}
              autoFocus
              disabled={saving}
              onClick={() => setDeleteOpen(false)}
            >
              {b.cancel}
            </button>
            <button
              type="button"
              className={s.primary}
              disabled={saving || p.deleteDisabled}
              onClick={async () => {
                setSaving(true);
                try {
                  if (await p.onDelete?.()) setDeleteOpen(false);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {deleteLabel}
            </button>
          </div>
        </DialogSurface>
      )}
      {(saveOpen || copyOpen) && (
        <DialogSurface
          className={s.dialog}
          aria-labelledby={`${uid}-save-title`}
          onDismiss={() => {
            if (!saving) {
              setSaveOpen(false);
              setCopyOpen(false);
            }
          }}
        >
          <h2 id={`${uid}-save-title`}>
            {copyOpen ? saveAsLabel : p.saveLabel}
          </h2>
          <label className={s.field}>
            {b.trainingName}
            <input
              autoFocus
              disabled={saving}
              className={s.input}
              data-onboarding="training-name" aria-label={b.trainingName}
              maxLength={160}
              value={copyOpen ? copyName : p.name}
              onChange={(event) =>
                copyOpen
                  ? setCopyName(event.target.value)
                  : p.onNameChange(event.target.value)
              }
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
              onClick={() => {
                setSaveOpen(false);
                setCopyOpen(false);
              }}
            >
              {b.cancel}
            </button>
            <button
              type="button"
              className={s.primary}
              disabled={
                saving || p.saveDisabled || (copyOpen && !copyName.trim())
              }
              data-onboarding="confirm-training-save" onClick={() => void save()}
            >
              {copyOpen ? saveAsLabel : p.saveLabel}
            </button>
          </div>
        </DialogSurface>
      )}
    </div>
  );
}

function TrainingName({
  name,
  onChange,
  disabled,
  label,
}: {
  label: string;
  name: string;
  onChange: (name: string) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={s.name}>
      {editing ? (
        <input
          aria-label={label}
          value={name}
          maxLength={160}
          disabled={disabled}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <>
          <h2>{name}</h2>
          <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </button>
        </>
      )}
    </div>
  );
}
