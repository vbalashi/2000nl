"use client";
import { LibraryLearningSummary } from "./LibraryLearningSummary";
import { useWordDetailsClose } from "../WordDetailsHeader";

import React from "react";
import { X } from "lucide-react";
import { LibraryMeaningActions } from "./LibraryMeaningActions";
import {ArticleTranslation,ArticleMeaningDetails} from "@/components/practice/article/ArticleContent";
import {ProductionArticleReading} from "@/components/practice/article/ProductionArticleReading";
import {ArticleWordForms,ArticleSenseRelations} from "@/components/practice/article/ArticleWordDetails";
import {commonWordForms,wordFormDetail,lexicalRelationDetail} from "@/components/practice/article/wordDetailsPresentation";
import reading from "@/components/practice/article/articleContent.module.css";
import surfaces from "@/components/practice/article/articleSurfaces.module.css";
import chrome from "@/components/practice/article/senseChrome.module.css";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  ChevronIcon,
  ExposureBadge,
  IdiomIcon,
  NewExposureBadge,
  LearningStateBadge,
  SenseCardHeaderAction,
  SenseCardReveal,
  SenseCardHeadwordLockup,
  SenseSectionHeader,
  SmallIcon,
  UsagePatternIcon,
} from "../SenseCardChrome";
import type {
  LibrarySenseCardGroupModel,
  LibrarySenseCardModel,
  LibrarySenseCardViewState,
  LibraryMutationCapability,
} from "./librarySenseCardModel";
import {
  reconcileLibrarySenseCardViewState,
  librarySenseCardIdentity,
} from "./librarySenseCardModel";

type Props = {
  revealActiveMeaning?: boolean;
  model: LibrarySenseCardGroupModel;
  interfaceLanguage: OnboardingLanguage;
  contentLanguage?: string;
  translationLanguage?: string;
  busyIdentity?: string | null;
  actionsDisabled?: boolean;
  inlineGrading?: boolean;
  audioBusy?: boolean;
  onPlayAudio?: () => void;
  translationEnabled?: boolean;
  translationStates?: Record<string, "pending" | "failed">;
  collectionCounts?: Record<string, number>;
  activeMeaningId?: string | null;
  onActiveMeaningChange?: (entryId: string) => void;
  onRequestTranslation?: (entryId: string, cardTypeId: CardTypeId) => void;
  onOpenCollections?: (meaning: LibrarySenseCardModel) => void;
  onTrainNext?: (meaning: LibrarySenseCardModel) => void;
  onReport?: (meaning: LibrarySenseCardModel) => void;
  onExclude?: () => void;
  exclusionDisabled?: boolean;
  reportableEntryIds?: ReadonlySet<string>;
  onFollowCrossReference?: (target: {
    query: string;
    sourceDictionaryId: string;
    targetHeadwordGroupId: string | null;
    targetEntryId: string | null;
  }) => void;
  onAction: (capability: LibraryMutationCapability) => void;
  /** Reserve reading space when a caller overlays a global action. */
  bottomOverlayReserve?: boolean;
};

const DETAILS_SCROLL_FADE_HEIGHT = 44;

export function LibrarySenseCardGroup({
  revealActiveMeaning = true,
  model,
  interfaceLanguage,
  contentLanguage,
  translationLanguage,
  busyIdentity = null,
  actionsDisabled = false,
  inlineGrading = true,
  audioBusy = false,
  onPlayAudio,
  translationEnabled = false,
  translationStates = {},
  collectionCounts = {},
  activeMeaningId = null,
  onActiveMeaningChange,
  onRequestTranslation,
  onOpenCollections,
  onTrainNext,
  onReport,
  onExclude,
  exclusionDisabled,
  reportableEntryIds,
  onFollowCrossReference,
  onAction,
  bottomOverlayReserve = false,
}: Props) {
  const [viewState, setViewState] = React.useState<LibrarySenseCardViewState>(
    () => initialViewState(model, activeMeaningId, revealActiveMeaning),
  );
  const [formsOpen,setFormsOpen]=React.useState(false);
  const formsId=React.useId();

  const commonForms=commonWordForms(model.meanings.map(m=>m.wordDetails),model.formPartOfSpeech??" ");
  const formsKey=JSON.stringify(commonForms);
  React.useEffect(()=>{setFormsOpen(false);},[model.headword,formsKey]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = React.useState({
    top: true,
    bottom: true,
  });
  const meaningById = new Map(
    model.meanings.map((meaning) => [meaning.entryId, meaning]),
  );
  const activeMeaningScrollKey = activeMeaningId && revealActiveMeaning
    ? `${activeMeaningId}\u0000${model.meanings
        .map((meaning) => meaning.entryId)
        .join("\u0000")}`
    : null;
  const lastScrolledMeaningKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    setViewState((current) => {
      const next = reconcileLibrarySenseCardViewState(current, model.meanings);
      if (!revealActiveMeaning) return collapsedViewState(next);
      // A slow lookup may arrive after the sheet. Do not also expand its first
      // meaning by default when a different training meaning is selected.
      if (activeMeaningId) for (const identity of Object.keys(next)) {
        if (!current[identity]) next[identity] = { ...next[identity], expanded: false };
      }
      const activeMeaning = activeMeaningId && revealActiveMeaning
        ? model.meanings.find((meaning) => meaning.entryId === activeMeaningId)
        : null;
      if (!activeMeaning) return next;
      const identity = librarySenseCardIdentity(
        activeMeaning.entryId,
        activeMeaning.cardTypeId,
      );
      return {
        ...next,
        [identity]: { ...next[identity], expanded: true },
      };
    });
  }, [activeMeaningId, model.meanings, revealActiveMeaning]);

  const updateEntry = (
    identity: string,
    update: (
      current: LibrarySenseCardViewState[string],
    ) => LibrarySenseCardViewState[string],
  ) => {
    setViewState((current) => ({
      ...current,
      [identity]: update(
        current[identity] ?? {
          expanded: false,
          translationVisible: false,
        },
      ),
    }));
  };

  const updateScrollEdges = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setScrollEdges({
      top: node.scrollTop <= 2,
      bottom: node.scrollTop + node.clientHeight >= node.scrollHeight - 2,
    });
  }, []);

  React.useEffect(() => {
    if (
      !activeMeaningScrollKey ||
      lastScrolledMeaningKey.current === activeMeaningScrollKey
    ) {
      return;
    }
    lastScrolledMeaningKey.current = activeMeaningScrollKey;
    const node = scrollRef.current;
    if (!node || !activeMeaningId) return;
    const target = Array.from(
      node.querySelectorAll<HTMLElement>("[data-entry-id]"),
    ).find((candidate) => candidate.dataset.entryId === activeMeaningId);
    if (!target) return;
    const nodeRect = node.getBoundingClientRect();
    const fadeHeight = Math.min(DETAILS_SCROLL_FADE_HEIGHT, node.clientHeight / 4);
    const targetRect = target.getBoundingClientRect();
    const leadRect = (
      target.querySelector<HTMLElement>("[data-meaning-lead]") ?? target
    ).getBoundingClientRect();
    if (
      leadRect.top < nodeRect.top + fadeHeight ||
      leadRect.bottom > nodeRect.bottom - fadeHeight
    ) {
      // Open at the beginning, not at the bottom of a card taller than the
      // viewport. Keep the first line below the pinned top fade.
      node.scrollTop += targetRect.top - nodeRect.top - fadeHeight;
    }
    updateScrollEdges();
  }, [activeMeaningId, activeMeaningScrollKey, updateScrollEdges]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    updateScrollEdges();
    node.addEventListener("scroll", updateScrollEdges, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollEdges);
    observer?.observe(node);
    return () => {
      node.removeEventListener("scroll", updateScrollEdges);
      observer?.disconnect();
    };
  }, [model, updateScrollEdges, viewState]);

  const closeDetails = useWordDetailsClose();
  const translationsVisible = model.meanings.every((meaning) => {
    const identity = librarySenseCardIdentity(
      meaning.entryId,
      meaning.cardTypeId,
    );
    return viewState[identity]?.translationVisible;
  });

  const toggleGroupTranslation = () => {
    const nextVisible = !translationsVisible;
    setViewState((current) =>
      Object.fromEntries(
        model.meanings.map((meaning) => {
          const identity = librarySenseCardIdentity(
            meaning.entryId,
            meaning.cardTypeId,
          );
          return [
            identity,
            {
              ...(current[identity] ?? {
                expanded: false,
                translationVisible: false,
              }),
              translationVisible: nextVisible,
            },
          ];
        }),
      ),
    );
    if (!nextVisible) return;
    for (const meaning of model.meanings) {
      const hasCachedTranslation = Boolean(
        meaning.entryTranslation ||
        meaning.definition?.translation ||
        meaning.details.some((item) => item.translation),
      );
      if (!hasCachedTranslation) {
        onRequestTranslation?.(meaning.entryId, meaning.cardTypeId);
      }
    }
  };

  return (
    <section
      data-testid="library-sense-card-group"
      className={`relative flex h-full flex-col overflow-hidden [container-type:inline-size] ${surfaces.group}`}
    >
      <header tabIndex={0} aria-label={model.headword}
        className={`shrink-0 px-4 pb-5 pt-4 sm:px-7 ${surfaces.header}`}>
        <SenseCardHeadwordLockup
          article={model.article}
          headword={model.headword}
          variant={"article"}
          partOfSpeech={model.partOfSpeech}
          coreVocabularyLabel={model.coreVocabularyLabel}
          tone="light"
          headerActions={
            (
              <>
                {onPlayAudio && model.audioCapability ? (
                  <SenseCardHeaderAction
                    label={platformV2Message(
                      interfaceLanguage,
                      "senseCard.audio.play",
                    )}
                    disabled={audioBusy}
                    onClick={onPlayAudio}
                  >
                    <AudioIcon />
                  </SenseCardHeaderAction>
                ) : null}
                {(
                  <SenseCardHeaderAction
                    label={platformV2Message(
                      interfaceLanguage,
                      translationEnabled ? "senseCard.translation.request" : "senseCard.translation.disabled",
                    )}
                    disabled={!translationEnabled}
                    accent
                    pressed={translationsVisible}
                    onClick={toggleGroupTranslation}
                  >
                    <TranslateIcon />
                  </SenseCardHeaderAction>
                )}
                {closeDetails && <span className={surfaces.closeAction}><SenseCardHeaderAction
                  label={platformV2Message(interfaceLanguage,"common.close")} onClick={closeDetails}>
                  <X size={18} aria-hidden="true" />
                </SenseCardHeaderAction></span>}
              </>
            )
          }
        />
        {commonForms&&<ProductionArticleReading><ArticleWordForms detail={commonForms} headword={model.headword} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage} part="summary" open={formsOpen} onToggle={()=>setFormsOpen(v=>!v)} id={formsId}/></ProductionArticleReading>}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-testid="library-sense-card-scroll-region"
          role="region"
          aria-label={platformV2Message(interfaceLanguage, "senseCard.wordDetails.open")}
          tabIndex={0}
          className={`${surfaces.readingRegion} h-full overflow-y-auto overscroll-contain px-3 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden ${bottomOverlayReserve ? "pb-16" : "pb-4"}`}
        >
          {commonForms&&<ProductionArticleReading><ArticleWordForms detail={commonForms} headword={model.headword} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage} part="body" open={formsOpen} onToggle={()=>setFormsOpen(v=>!v)} id={formsId}/></ProductionArticleReading>}
          <div className="space-y-3">
            {model.presentations.map((presentation) => {
              if (presentation.kind === "cross-reference") {
                const reference = presentation.reference;
                return (
                  <article
                    key={reference.crossReferenceId}
                    data-testid={`library-cross-reference-${reference.crossReferenceId}`}
                    className={`relative px-5 py-5 ${surfaces.card}`}
                  >
                    {reference.displayOrdinal != null ? (
                      <span className={`absolute -left-px -top-px flex h-5 w-5 -translate-x-[18%] -translate-y-[18%] items-center justify-center ${surfaces.ordinal}`}>
                        {reference.displayOrdinal}
                      </span>
                    ) : null}
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {reference.label}
                    </p>
                    <p className="mt-1 font-sense-serif text-2xl text-slate-900 dark:text-slate-100">
                      {reference.text}
                    </p>
                    <button
                      type="button"
                      aria-label={reference.followLabel}
                      onClick={() =>
                        onFollowCrossReference?.({
                          query: reference.targetQuery,
                          sourceDictionaryId: reference.sourceDictionaryId,
                          targetHeadwordGroupId:
                            reference.targetHeadwordGroupId,
                          targetEntryId: reference.targetEntryId,
                        })
                      }
                      className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      {reference.followLabel}
                    </button>
                  </article>
                );
              }
              const meaning =
                meaningById.get(presentation.meaning.entryId) ??
                presentation.meaning;
              const identity = librarySenseCardIdentity(
                meaning.entryId,
                meaning.cardTypeId,
              );
              return (
                <MeaningCard
                  key={identity}
                  meaning={inlineGrading ? meaning : {...meaning, reviewCapabilities: []}}
                  showSenseForms={!commonForms}
                  formPartOfSpeech={model.formPartOfSpeech}
                  headword={model.headword}
                  contentLanguage={contentLanguage}
                  translationLanguage={translationLanguage}
                  groupPartOfSpeech={model.partOfSpeech}
                  state={
                    viewState[identity] ?? {
                      expanded: false,
                      translationVisible: false,
                    }
                  }
                  interfaceLanguage={interfaceLanguage}
                  busy={actionsDisabled || Boolean(busyIdentity)}
                  translationState={translationStates[identity] ?? null}
                  collectionCount={collectionCounts[meaning.entryId] ?? 0}
                  onToggleExpanded={() =>
                    updateEntry(identity, (current) => ({
                      ...current,
                      expanded: !current.expanded,
                    }))
                  }
                  onActiveMeaningChange={onActiveMeaningChange}
                  onRetryTranslation={() =>
                    onRequestTranslation?.(meaning.entryId, meaning.cardTypeId)
                  }
                  onOpenCollections={onOpenCollections}
                  onTrainNext={onTrainNext}
                  onReport={onReport}
                  onExclude={onExclude}
                  exclusionDisabled={exclusionDisabled}
                  reportableEntryIds={reportableEntryIds}
                  onAction={(capability) => {
                    onActiveMeaningChange?.(capability.target.entryId);
                    onAction(capability);
                  }}
                />
              );
            })}
          </div>
        </div>
        {!scrollEdges.top ? <ScrollFade edge="top" /> : null}
        {!scrollEdges.bottom ? <ScrollFade edge="bottom" /> : null}
      </div>
    </section>
  );
}

function MeaningCard({
  meaning,
  showSenseForms,
  formPartOfSpeech,
  headword,
  groupPartOfSpeech,
  state,
  interfaceLanguage,
  contentLanguage,
  translationLanguage,
  busy,
  translationState,
  collectionCount,
  onToggleExpanded,
  onActiveMeaningChange,
  onRetryTranslation,
  onOpenCollections,
  onTrainNext,
  onReport,
  onExclude,
  exclusionDisabled,
  reportableEntryIds,
  onAction,
}: {
  meaning: LibrarySenseCardModel;
  headword:string;
  showSenseForms?:boolean;
  formPartOfSpeech?:string;
  groupPartOfSpeech: string | null;
  state: LibrarySenseCardViewState[string];
  interfaceLanguage: OnboardingLanguage;
  contentLanguage?: string;
  translationLanguage?: string;
  busy: boolean;
  translationState: "pending" | "failed" | null;
  collectionCount: number;
  onToggleExpanded: () => void;
  onActiveMeaningChange?: (entryId: string) => void;
  onRetryTranslation: () => void;
  onOpenCollections?: (meaning: LibrarySenseCardModel) => void;
  onTrainNext?: (meaning: LibrarySenseCardModel) => void;
  onReport?: (meaning: LibrarySenseCardModel) => void;
  onExclude?: () => void;
  exclusionDisabled?: boolean;
  reportableEntryIds?: ReadonlySet<string>;
  onAction: (capability: LibraryMutationCapability) => void;
}) {
  const t = (key: string, variables?: Record<string, string | number>) =>
    platformV2Message(interfaceLanguage, key, variables);
  const activateCard = () => {
    onActiveMeaningChange?.(meaning.entryId);
    if (!state.expanded) onToggleExpanded();
  };
  const [formsOpen,setFormsOpen]=React.useState(false);
  const formsId=React.useId();
  const senseForms=wordFormDetail(meaning.wordDetails,formPartOfSpeech??" ");

  const exposure = meaning.undoKnown ? (
    <span className={surfaces.known}>
      {t("senseCard.known.marked")}
    </span>
  ) : meaning.schedulerPhase === "learning" || meaning.schedulerPhase === "reviewing" ? (
    <span className="inline-flex items-center gap-1"><LearningStateBadge label={t("senseCard.state.learning")} tone="light" />{meaning.repeatCount > 0 ? <ExposureBadge count={meaning.repeatCount} tone="light" /> : null}</span>
  ) : meaning.schedulerPhase === "hidden" || meaning.schedulerPhase === "frozen" ? (
    <span>{t(`senseCard.state.${meaning.schedulerPhase}`)}</span>
  ) : meaning.schedulerPhase === null ? (
    <span>{t("senseCard.state.unavailable")}</span>
  ) : meaning.repeatCount > 0 ? (
    <ExposureBadge count={meaning.repeatCount} tone="light" />
  ) : (
    <NewExposureBadge label={t("senseCard.state.new")} tone="light" />
  );
  const hasVisibleLeadTranslation =
    state.translationVisible &&
    Boolean(meaning.entryTranslation || meaning.definition?.translation);

  return (
    <article
      data-testid={`library-sense-card-${meaning.entryId}`}
      data-entry-id={meaning.entryId}
      data-expanded={state.expanded ? "true" : "false"}
      onClick={activateCard}
      className={`relative px-[clamp(1rem,4cqw,1.25rem)] outline-none transition-[padding,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none ${surfaces.card} ${
        state.expanded ? "pb-3 pt-4" : "py-2.5"
      }`}
    >
      {<span className={surfaces.frameExposure}>{exposure}</span>}
      {meaning.displayOrdinal != null ? (
        <span className={`absolute -left-px -top-px flex h-5 w-5 -translate-x-[18%] -translate-y-[18%] items-center justify-center ${surfaces.ordinal}`}>
          {meaning.displayOrdinal}
        </span>
      ) : null}

      <div>
        <div
          data-testid="library-sense-card-lead"
          data-meaning-lead
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3"
        >
          <div className="min-w-0">
            {<ProductionArticleReading>
              <ArticleTranslation text={[meaning.entryTranslation,...meaning.entryTranslationAlternatives].filter(Boolean).join(" · ")} visible={state.translationVisible} emphasis language={translationLanguage}/>
              <p className={reading.definitionText} lang={contentLanguage}>{meaning.definition?.text??"—"}</p>
              <ArticleTranslation text={meaning.definition?.translation} visible={state.translationVisible} language={translationLanguage}/>
            </ProductionArticleReading>}

          </div>
          <div
            className="flex shrink-0 items-center gap-2"
            data-testid="sense-card-top-actions"
          >
            {null}
            <button
              type="button"
              aria-label={t(
                state.expanded ? "senseCard.collapse" : "senseCard.expand",
              )}
              aria-expanded={state.expanded}
              onClick={(event) => {
                event.stopPropagation();
                onActiveMeaningChange?.(meaning.entryId);
                onToggleExpanded();
              }}
              className={chrome.toggle}
            >
              <ChevronIcon
                className="h-3.5 w-3.5"
                direction={state.expanded ? "up" : "down"}
              />
            </button>
          </div>
        </div>
        {null}

        {meaning.partOfSpeech && meaning.partOfSpeech !== groupPartOfSpeech ? (
          <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {meaning.partOfSpeech}
          </div>
        ) : null}

        <SenseCardReveal
          open={state.expanded}
          expandedClassName={"mt-0"}
        >
          <div onClick={(event) => event.stopPropagation()}>
            {<ProductionArticleReading><ArticleSenseRelations relation={lexicalRelationDetail(meaning.wordDetails)} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage}/>{showSenseForms&&senseForms&&<><ArticleWordForms detail={senseForms} headword={headword} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage} part="summary" open={formsOpen} onToggle={()=>setFormsOpen(v=>!v)} id={formsId}/><ArticleWordForms detail={senseForms} headword={headword} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage} part="body" open={formsOpen} onToggle={()=>setFormsOpen(v=>!v)} id={formsId}/></>}<ArticleMeaningDetails definition={meaning.definition} details={meaning.details} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage} translationLanguage={translationLanguage} translationVisible={state.translationVisible}/></ProductionArticleReading>}


            <LibraryLearningSummary meaning={meaning} language={interfaceLanguage} />
            {(
              <LibraryMeaningActions meaning={meaning} language={interfaceLanguage} busy={busy} collectionCount={collectionCount}
                onAction={onAction}
                onExclude={onExclude} exclusionDisabled={exclusionDisabled}
                onCollections={onOpenCollections ? () => { onActiveMeaningChange?.(meaning.entryId); onOpenCollections(meaning); } : undefined}
                onTrainNext={onTrainNext ? () => { onActiveMeaningChange?.(meaning.entryId); onTrainNext(meaning); } : undefined}
              onReport={onReport && reportableEntryIds?.has(meaning.entryId) ? () => onReport(meaning) : undefined}
              />
            )}
            {translationState ? (
              <div
                role={translationState === "failed" ? "alert" : "status"}
                className="mt-2 text-sm text-slate-500 dark:text-slate-400"
              >
                {translationState === "pending"
                  ? t("senseCard.translation.pending")
                  : t("senseCard.translation.failed")}
                {translationState === "failed" ? (
                  <button
                    type="button"
                    onClick={() => {
                      onActiveMeaningChange?.(meaning.entryId);
                      onRetryTranslation();
                    }}
                    className="ml-2 font-semibold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-300"
                  >
                    {t("senseCard.translation.retry")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </SenseCardReveal>
      </div>
    </article>
  );
}

function TranslateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h9M8.5 3v2M6 8c1.2 2.6 3.1 4.4 5.5 5.5M11.5 8c-.8 2.2-2.3 4-4.5 5.5" />
      <path d="m14 19 3.5-9 3.5 9M15.2 16h4.6" />
    </svg>
  );
}

function NestedContent({
  item,
  translationVisible,
}: {
  item: LibrarySenseCardModel["details"][number];
  translationVisible: boolean;
}) {
  return (
    <div
      data-content-kind={item.kind}
      data-content-node-id={item.contentNodeId}
      data-parent-content-node-id={item.parentContentNodeId ?? undefined}
    >
      <ContentText
        item={item}
        translationVisible={translationVisible}
      />
      {item.children.length ? (
        <div className="mt-2 space-y-2 pl-4">
          {item.children.map((child) => (
            <NestedContent
              key={child.contentNodeId}
              item={child}
              translationVisible={translationVisible}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContentText({
  item,
  translationVisible,
}: {
  item: LibrarySenseCardModel["details"][number];
  translationVisible: boolean;
}) {
  const presentation = contentPresentation[item.kind];
  return (
    <div className={`pl-3 ${presentation.borderClassName}`}>
      <div className="flex items-start gap-2">
        <p className={`min-w-0 flex-1 ${presentation.textClassName}`}>
          {item.text}
        </p>
      </div>
      {item.translation ? (
        <SenseCardReveal open={translationVisible}>
          <p className="mt-1 text-[length:var(--reading-translation-size,13px)] leading-[var(--reading-translation-leading,1.35)] text-slate-500 dark:text-slate-400">
            {item.translation}
          </p>
        </SenseCardReveal>
      ) : null}
    </div>
  );
}

function ContentSectionHeader({
  label,
  sectionGroup,
  count,
}: {
  label: string;
  sectionGroup: string;
  count: number;
}) {
  const Icon =
    sectionGroup === "usage"
      ? UsagePatternIcon
      : sectionGroup === "examples"
        ? ListIcon
        : sectionGroup === "idioms"
          ? IdiomIcon
          : null;
  return (
    <div data-section-icon={Icon ? sectionGroup : undefined} className="mb-2">
      <SenseSectionHeader
        label={label}
        icon={Icon ? <Icon className="h-3 w-3" /> : undefined}
        count={count > 1 ? count : undefined}
        tone="light"
      />
    </div>
  );
}

function ScrollFade({ edge }: { edge: "top" | "bottom" }) {

  const isTop = edge === "top";
  return (
    <div
      aria-hidden="true"
      data-scroll-affordance={edge}
      // Leave at least half of a short reading region free from decoration.
      // Keep the selected-meaning scroll inset above in sync with this cap.
      style={{ height: `min(${DETAILS_SCROLL_FADE_HEIGHT}px, 25%)` }}
      className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4 ${surfaces.scrollFade} ${
        (isTop ? "top-0 items-start pt-1" : "bottom-0 items-end pb-1")
      }`}
    >
      <SmallIcon
        className={`h-4 w-4 ${surfaces.scrollFadeIcon} ${isTop ? "" : "rotate-180"}`}
      >
        <path d="m6 14 6-6 6 6" />
      </SmallIcon>
    </div>
  );
}

function initialViewState(
  model: LibrarySenseCardGroupModel,
  activeMeaningId: string | null = null,
  revealActiveMeaning = true,
): LibrarySenseCardViewState {
  const state = reconcileLibrarySenseCardViewState({}, model.meanings);
  if (!revealActiveMeaning) return collapsedViewState(state);
  if (!activeMeaningId) return state;
  const meaning = model.meanings.find(
    (candidate) => candidate.entryId === activeMeaningId,
  );
  if (!meaning) return state;
  return {
    ...Object.fromEntries(
      model.meanings.map((candidate) => {
        const identity = librarySenseCardIdentity(
          candidate.entryId,
          candidate.cardTypeId,
        );
        return [
          identity,
          {
            ...state[identity],
            expanded: candidate.entryId === meaning.entryId,
          },
        ];
      }),
    ),
  };
}

function collapsedViewState(state: LibrarySenseCardViewState): LibrarySenseCardViewState {
  return Object.fromEntries(Object.entries(state).map(([identity, value]) => [
    identity, { ...value, expanded: false },
  ]));
}

const contentPresentation: Record<
  LibrarySenseCardModel["details"][number]["kind"],
  {
    sectionGroup: string;
    labelKey: string | null;
    borderClassName: string;
    textClassName: string;
  }
> = {
  definition: {
    sectionGroup: "definition",
    labelKey: "senseCard.sections.definition",
    borderClassName: "border-l-[3px] border-slate-400",
    textClassName:
      "text-[length:var(--reading-body-size,16px)] leading-[var(--reading-body-leading,1.15)] text-slate-700 dark:text-slate-200",
  },
  "usage-pattern": {
    sectionGroup: "usage",
    labelKey: "senseCard.sections.usagePattern",
    borderClassName: "border-l-[3px] border-slate-400",
    textClassName:
      "font-sense-serif text-[length:var(--reading-literary-size,16px)] italic leading-[var(--reading-literary-leading,1.4)] text-slate-700 dark:text-slate-200",
  },
  example: {
    sectionGroup: "examples",
    labelKey: "senseCard.sections.examples",
    borderClassName: "border-l-[3px] border-indigo-400",
    textClassName:
      "font-sense-serif text-[length:var(--reading-literary-size,16px)] italic leading-[var(--reading-literary-leading,1.4)] text-slate-700 dark:text-slate-200",
  },
  idiom: {
    sectionGroup: "idioms",
    labelKey: "senseCard.sections.idioms",
    borderClassName: "border-l-[3px] border-amber-400",
    textClassName:
      "font-sense-serif text-[length:var(--reading-literary-size,16px)] italic leading-[var(--reading-literary-leading,1.4)] text-slate-700 dark:text-slate-200",
  },
  "idiom-explanation": {
    sectionGroup: "idioms",
    labelKey: null,
    borderClassName: "border-l-[3px] border-amber-300",
    textClassName:
      "text-[length:var(--reading-nested-size,13px)] leading-[var(--reading-nested-leading,1.35)] text-slate-600 dark:text-slate-300",
  },
  "usage-note": {
    sectionGroup: "notes",
    labelKey: "senseCard.sections.notes",
    borderClassName: "border-l-[3px] border-slate-400",
    textClassName:
      "text-[length:var(--reading-nested-size,13px)] leading-[var(--reading-nested-leading,1.35)] text-slate-600 dark:text-slate-300",
  },
};

const contentSectionOrder: Record<
  LibrarySenseCardModel["details"][number]["kind"],
  number
> = {
  definition: 0,
  "usage-pattern": 1,
  example: 2,
  idiom: 3,
  "idiom-explanation": 3,
  "usage-note": 4,
};

function orderMeaningDetails(
  details: LibrarySenseCardModel["details"],
): LibrarySenseCardModel["details"] {
  return details
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort(
      (left, right) =>
        contentSectionOrder[left.item.kind] -
          contentSectionOrder[right.item.kind] ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ item }) => item);
}

function AudioIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6.5 9H3v6h3.5l4.5 4V5Z" />
      <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

type SmallIconProps = { className: string };

function ListIcon({ className }: SmallIconProps) {
  return (
    <SmallIcon className={className}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </SmallIcon>
  );
}
