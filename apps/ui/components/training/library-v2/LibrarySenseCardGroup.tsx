"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  ChevronIcon,
  ExposureBadge,
  FlagIcon,
  IdiomIcon,
  NewExposureBadge,
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
  LibraryReportCapability,
} from "./librarySenseCardModel";
import {
  reconcileLibrarySenseCardViewState,
  librarySenseCardIdentity,
} from "./librarySenseCardModel";

type Props = {
  model: LibrarySenseCardGroupModel;
  interfaceLanguage: OnboardingLanguage;
  busyIdentity?: string | null;
  audioBusy?: boolean;
  onPlayAudio?: () => void;
  translationEnabled?: boolean;
  translationStates?: Record<string, "pending" | "failed">;
  collectionCounts?: Record<string, number>;
  onRequestTranslation?: (entryId: string, cardTypeId: CardTypeId) => void;
  onOpenCollections?: (meaning: LibrarySenseCardModel) => void;
  onTrainNext?: (meaning: LibrarySenseCardModel) => void;
  onReport?: (capability: LibraryReportCapability) => void;
  onFollowCrossReference?: (target: {
    query: string;
    sourceDictionaryId: string;
    targetHeadwordGroupId: string | null;
    targetEntryId: string | null;
  }) => void;
  onAction: (capability: LibraryMutationCapability) => void;
};

export function LibrarySenseCardGroup({
  model,
  interfaceLanguage,
  busyIdentity = null,
  audioBusy = false,
  onPlayAudio,
  translationEnabled = false,
  translationStates = {},
  collectionCounts = {},
  onRequestTranslation,
  onOpenCollections,
  onTrainNext,
  onReport,
  onFollowCrossReference,
  onAction,
}: Props) {
  const [viewState, setViewState] = React.useState<LibrarySenseCardViewState>(
    () => initialViewState(model),
  );
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = React.useState({
    top: true,
    bottom: true,
  });
  const meaningById = new Map(
    model.meanings.map((meaning) => [meaning.entryId, meaning]),
  );

  React.useEffect(() => {
    setViewState((current) =>
      reconcileLibrarySenseCardViewState(current, model.meanings),
    );
  }, [model.meanings]);

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
      className="relative flex h-full flex-col overflow-hidden bg-slate-50 font-sense-sans text-slate-900 [container-type:inline-size] dark:bg-[#11151d] dark:text-slate-100"
    >
      <header className="shrink-0 px-4 pb-5 pt-4 sm:px-7">
        <SenseCardHeadwordLockup
          article={model.article}
          headword={model.headword}
          partOfSpeech={model.partOfSpeech}
          coreVocabularyLabel={model.coreVocabularyLabel}
          tone="light"
          inlineAction={
            onPlayAudio && model.audioCapability ? (
              <button
                type="button"
                disabled={audioBusy}
                aria-label={platformV2Message(
                  interfaceLanguage,
                  "senseCard.audio.play",
                )}
                onClick={onPlayAudio}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
              >
                <AudioIcon />
              </button>
            ) : null
          }
          topActions={
            translationEnabled ? (
              <button
                type="button"
                aria-label={platformV2Message(
                  interfaceLanguage,
                  "senseCard.translation.request",
                )}
                aria-pressed={translationsVisible}
                onClick={toggleGroupTranslation}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-300 text-indigo-600 transition hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-400/10"
              >
                <TranslateIcon />
              </button>
            ) : null
          }
        />
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-testid="library-sense-card-scroll-region"
          className="h-full overflow-y-auto px-3 pb-4 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden"
        >
          <div className="space-y-3">
            {model.presentations.map((presentation) => {
              if (presentation.kind === "cross-reference") {
                const reference = presentation.reference;
                return (
                  <article
                    key={reference.crossReferenceId}
                    data-testid={`library-cross-reference-${reference.crossReferenceId}`}
                    className="relative rounded-[22px] border border-slate-300 bg-white px-5 py-5 shadow-sm dark:border-slate-600 dark:bg-[#20252f]"
                  >
                    {reference.displayOrdinal != null ? (
                      <span className="absolute -left-px -top-px flex h-5 w-5 -translate-x-[18%] -translate-y-[18%] items-center justify-center bg-slate-50 font-mono text-xs font-semibold text-indigo-600 dark:bg-[#11151d] dark:text-indigo-300">
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
                  meaning={meaning}
                  groupPartOfSpeech={model.partOfSpeech}
                  state={
                    viewState[identity] ?? {
                      expanded: false,
                      translationVisible: false,
                    }
                  }
                  interfaceLanguage={interfaceLanguage}
                  busy={busyIdentity === identity}
                  translationState={translationStates[identity] ?? null}
                  collectionCount={collectionCounts[meaning.entryId] ?? 0}
                  onToggleExpanded={() =>
                    updateEntry(identity, (current) => ({
                      ...current,
                      expanded: !current.expanded,
                    }))
                  }
                  onRetryTranslation={() =>
                    onRequestTranslation?.(meaning.entryId, meaning.cardTypeId)
                  }
                  onOpenCollections={onOpenCollections}
                  onTrainNext={onTrainNext}
                  onReport={onReport}
                  onAction={onAction}
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
  groupPartOfSpeech,
  state,
  interfaceLanguage,
  busy,
  translationState,
  collectionCount,
  onToggleExpanded,
  onRetryTranslation,
  onOpenCollections,
  onTrainNext,
  onReport,
  onAction,
}: {
  meaning: LibrarySenseCardModel;
  groupPartOfSpeech: string | null;
  state: LibrarySenseCardViewState[string];
  interfaceLanguage: OnboardingLanguage;
  busy: boolean;
  translationState: "pending" | "failed" | null;
  collectionCount: number;
  onToggleExpanded: () => void;
  onRetryTranslation: () => void;
  onOpenCollections?: (meaning: LibrarySenseCardModel) => void;
  onTrainNext?: (meaning: LibrarySenseCardModel) => void;
  onReport?: (capability: LibraryReportCapability) => void;
  onAction: (capability: LibraryMutationCapability) => void;
}) {
  const t = (key: string, variables?: Record<string, string | number>) =>
    platformV2Message(interfaceLanguage, key, variables);
  const activateCard = () => {
    if (!state.expanded) onToggleExpanded();
  };
  const hasVisibleLeadTranslation =
    state.translationVisible &&
    Boolean(meaning.entryTranslation || meaning.definition?.translation);

  return (
    <article
      data-testid={`library-sense-card-${meaning.entryId}`}
      data-entry-id={meaning.entryId}
      data-expanded={state.expanded ? "true" : "false"}
      onClick={activateCard}
      className={`relative rounded-[22px] border border-slate-300 bg-white px-[clamp(1rem,4cqw,1.25rem)] shadow-sm outline-none transition-[padding,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-[#20252f] dark:shadow-none ${
        state.expanded ? "pb-3 pt-4" : "py-2.5"
      }`}
    >
      {meaning.displayOrdinal != null ? (
        <span className="absolute -left-px -top-px flex h-5 w-5 -translate-x-[18%] -translate-y-[18%] items-center justify-center bg-slate-50 font-mono text-xs font-semibold text-indigo-600 dark:bg-[#11151d] dark:text-indigo-300">
          {meaning.displayOrdinal}
        </span>
      ) : null}

      <div>
        <div
          data-testid="library-sense-card-lead"
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3"
        >
          <div className="min-w-0">
            {meaning.entryTranslation ? (
              <SenseCardReveal open={state.translationVisible}>
                <p className="mb-1 text-sm font-[650] text-amber-700 dark:text-[#dbc47e]">
                  {[
                    meaning.entryTranslation,
                    ...(meaning.entryTranslationAlternatives ?? []),
                  ].join(" · ")}
                </p>
              </SenseCardReveal>
            ) : null}
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-[14.5px] leading-[1.45] text-slate-800 dark:text-slate-100">
                {meaning.definition?.text ?? "—"}
              </p>
              {meaning.definition?.reportCapability && onReport ? (
                <button
                  type="button"
                  aria-label={`${t("senseCard.report")}: ${meaning.definition.text}`}
                  onClick={() =>
                    onReport(meaning.definition!.reportCapability!)
                  }
                  className="mt-0.5 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <FlagIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            {meaning.definition?.translation ? (
              <SenseCardReveal open={state.translationVisible}>
                <p className="mt-1 text-[12.5px] leading-[1.45] text-slate-500 dark:text-slate-400">
                  {meaning.definition.translation}
                </p>
              </SenseCardReveal>
            ) : null}
          </div>
          <div
            className="flex shrink-0 items-center gap-2"
            data-testid="sense-card-top-actions"
          >
            {meaning.undoKnown ? (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300">
                {t("senseCard.known.marked")}
              </span>
            ) : meaning.repeatCount > 0 ? (
              <ExposureBadge count={meaning.repeatCount} tone="light" />
            ) : (
              <NewExposureBadge label={t("senseCard.state.new")} tone="light" />
            )}
            <button
              type="button"
              aria-label={t(
                state.expanded ? "senseCard.collapse" : "senseCard.expand",
              )}
              aria-expanded={state.expanded}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpanded();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:text-slate-800 dark:bg-[#171b22] dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ChevronIcon
                className="h-3.5 w-3.5"
                direction={state.expanded ? "up" : "down"}
              />
            </button>
          </div>
        </div>
        {meaning.definition?.children.length ? (
          <div className="mt-2 space-y-2 pl-4">
            {meaning.definition.children.map((child) => (
              <NestedContent
                key={child.contentNodeId}
                item={child}
                translationVisible={state.translationVisible}
                onReport={onReport}
                reportLabel={t("senseCard.report")}
              />
            ))}
          </div>
        ) : null}

        {meaning.partOfSpeech && meaning.partOfSpeech !== groupPartOfSpeech ? (
          <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {meaning.partOfSpeech}
          </div>
        ) : null}

        <SenseCardReveal
          open={state.expanded}
          expandedClassName={hasVisibleLeadTranslation ? "mt-4" : "mt-3"}
        >
          <div onClick={(event) => event.stopPropagation()}>
            {meaning.details.length ? (
              <div className="space-y-4">
                {orderMeaningDetails(meaning.details).map(
                  (item, index, orderedDetails) => {
                    const presentation = contentPresentation[item.kind];
                    const previous = orderedDetails[index - 1];
                    const showLabel =
                      presentation.labelKey &&
                      (!previous ||
                        contentPresentation[previous.kind].sectionGroup !==
                          presentation.sectionGroup);
                    return (
                      <section
                        key={item.contentNodeId}
                        data-content-kind={item.kind}
                        data-content-node-id={item.contentNodeId}
                        data-parent-content-node-id={
                          item.parentContentNodeId ?? undefined
                        }
                      >
                        {showLabel && presentation.labelKey ? (
                          <ContentSectionHeader
                            label={t(presentation.labelKey)}
                            sectionGroup={presentation.sectionGroup}
                            count={
                              orderedDetails.filter(
                                (candidate) =>
                                  contentPresentation[candidate.kind]
                                    .sectionGroup === presentation.sectionGroup,
                              ).length
                            }
                          />
                        ) : null}
                        <ContentText
                          item={item}
                          translationVisible={state.translationVisible}
                          onReport={onReport}
                          reportLabel={t("senseCard.report")}
                        />
                        {item.children.length ? (
                          <div className="mt-2 space-y-2 pl-4">
                            {item.children.map((child) => (
                              <NestedContent
                                key={child.contentNodeId}
                                item={child}
                                translationVisible={state.translationVisible}
                                onReport={onReport}
                                reportLabel={t("senseCard.report")}
                              />
                            ))}
                          </div>
                        ) : null}
                      </section>
                    );
                  },
                )}
              </div>
            ) : null}

            <div
              data-testid="library-primary-actions"
              className="mt-4 grid grid-cols-[minmax(0,3fr)_minmax(7.5rem,1fr)] gap-2 text-xs"
            >
              {onOpenCollections ? (
                <button
                  type="button"
                  onClick={() => onOpenCollections(meaning)}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 font-semibold text-slate-600 transition hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-indigo-200"
                >
                  <ListIcon className="h-3.5 w-3.5" />
                  {t("senseCard.collections.label")}
                  {collectionCount > 0 ? ` · ${collectionCount}` : ""}
                </button>
              ) : (
                <span />
              )}
              {onTrainNext ? (
                <button
                  type="button"
                  onClick={() => onTrainNext(meaning)}
                  className="min-h-10 rounded-xl border border-indigo-400 bg-indigo-500/10 px-3 font-semibold text-indigo-700 transition hover:bg-indigo-500/15 dark:text-indigo-200"
                >
                  {t("senseCard.training.next")}
                </button>
              ) : null}
            </div>

            <div
              data-testid="library-service-actions"
              className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]"
            >
              {meaning.reportCapability && onReport ? (
                <button
                  type="button"
                  onClick={() => onReport(meaning.reportCapability!)}
                  className="inline-flex items-center gap-1.5 font-semibold text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  <FlagIcon className="h-3.5 w-3.5" />
                  {t("senseCard.report")}
                </button>
              ) : null}
              {meaning.startLearning ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(meaning.startLearning!)}
                  className="font-semibold text-slate-500 transition hover:text-indigo-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-indigo-200"
                >
                  {t(meaning.startLearning.messageKey)}
                </button>
              ) : null}
              <div className="min-w-0 flex-1" />
              <KnownAction
                meaning={meaning}
                interfaceLanguage={interfaceLanguage}
                busy={busy}
                onAction={onAction}
              />
            </div>
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
                    onClick={onRetryTranslation}
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

function KnownAction({
  meaning,
  interfaceLanguage,
  busy,
  onAction,
}: {
  meaning: LibrarySenseCardModel;
  interfaceLanguage: OnboardingLanguage;
  busy: boolean;
  onAction: (capability: LibraryMutationCapability) => void;
}) {
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  if (meaning.undoKnown) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onAction(meaning.undoKnown!)}
        className="rounded-lg border border-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50 dark:text-emerald-300"
      >
        {t("senseCard.known.marked")} · {t(meaning.undoKnown.messageKey)}
      </button>
    );
  }
  if (!meaning.markKnown) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onAction(meaning.markKnown!)}
      className="font-semibold text-slate-500 transition hover:text-emerald-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-emerald-300"
    >
      ✓ {t(meaning.markKnown.messageKey)}
    </button>
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
  onReport,
  reportLabel,
}: {
  item: LibrarySenseCardModel["details"][number];
  translationVisible: boolean;
  onReport?: (capability: LibraryReportCapability) => void;
  reportLabel: string;
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
        onReport={onReport}
        reportLabel={reportLabel}
      />
      {item.children.length ? (
        <div className="mt-2 space-y-2 pl-4">
          {item.children.map((child) => (
            <NestedContent
              key={child.contentNodeId}
              item={child}
              translationVisible={translationVisible}
              onReport={onReport}
              reportLabel={reportLabel}
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
  onReport,
  reportLabel,
}: {
  item: LibrarySenseCardModel["details"][number];
  translationVisible: boolean;
  onReport?: (capability: LibraryReportCapability) => void;
  reportLabel: string;
}) {
  const presentation = contentPresentation[item.kind];
  return (
    <div className={`pl-3 ${presentation.borderClassName}`}>
      <div className="flex items-start gap-2">
        <p className={`min-w-0 flex-1 ${presentation.textClassName}`}>
          {item.text}
        </p>
        {item.reportCapability && onReport ? (
          <button
            type="button"
            aria-label={`${reportLabel}: ${item.text}`}
            onClick={() => onReport(item.reportCapability!)}
            className="mt-0.5 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <FlagIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {item.translation ? (
        <SenseCardReveal open={translationVisible}>
          <p className="mt-1 text-[12.5px] leading-[1.45] text-slate-500 dark:text-slate-400">
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
      className={`pointer-events-none absolute inset-x-0 z-20 flex h-11 justify-center px-4 ${
        isTop
          ? "top-0 items-start bg-gradient-to-b from-slate-50 via-slate-50/90 to-transparent pt-1 dark:from-[#11151d] dark:via-[#11151d]/90"
          : "bottom-0 items-end bg-gradient-to-t from-slate-50 via-slate-50/90 to-transparent pb-1 dark:from-[#11151d] dark:via-[#11151d]/90"
      }`}
    >
      <SmallIcon
        className={`h-4 w-4 text-slate-400 ${isTop ? "" : "rotate-180"}`}
      >
        <path d="m6 14 6-6 6 6" />
      </SmallIcon>
    </div>
  );
}

function initialViewState(
  model: LibrarySenseCardGroupModel,
): LibrarySenseCardViewState {
  return reconcileLibrarySenseCardViewState({}, model.meanings);
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
      "text-[14.5px] leading-[1.45] text-slate-700 dark:text-slate-200",
  },
  "usage-pattern": {
    sectionGroup: "usage",
    labelKey: "senseCard.sections.usagePattern",
    borderClassName: "border-l-[3px] border-slate-400",
    textClassName:
      "font-sense-serif text-base italic leading-[1.35] text-slate-700 dark:text-slate-200",
  },
  example: {
    sectionGroup: "examples",
    labelKey: "senseCard.sections.examples",
    borderClassName: "border-l-[3px] border-indigo-400",
    textClassName:
      "font-sense-serif text-base italic leading-[1.35] text-slate-700 dark:text-slate-200",
  },
  idiom: {
    sectionGroup: "idioms",
    labelKey: "senseCard.sections.idioms",
    borderClassName: "border-l-[3px] border-amber-400",
    textClassName:
      "font-sense-serif text-base italic leading-[1.35] text-slate-700 dark:text-slate-200",
  },
  "idiom-explanation": {
    sectionGroup: "idioms",
    labelKey: null,
    borderClassName: "border-l-[3px] border-amber-300",
    textClassName:
      "text-[14.5px] leading-[1.45] text-slate-600 dark:text-slate-300",
  },
  "usage-note": {
    sectionGroup: "notes",
    labelKey: "senseCard.sections.notes",
    borderClassName: "border-l-[3px] border-slate-400",
    textClassName:
      "text-[14.5px] leading-[1.45] text-slate-600 dark:text-slate-300",
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
