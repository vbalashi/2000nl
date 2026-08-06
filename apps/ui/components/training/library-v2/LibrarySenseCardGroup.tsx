"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  ExposureBadge,
  FlagIcon,
  NewExposureBadge,
  SenseCardHeadwordLockup,
  SenseSectionHeader,
  SmallIcon,
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
      className="relative h-full overflow-hidden bg-slate-50 font-sense-sans text-slate-900 [container-type:inline-size] dark:bg-[#11151d] dark:text-slate-100"
    >
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-3 py-4 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden"
      >
        <header className="mb-5 px-1 sm:px-2">
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

        <div className="space-y-3">
          {model.meanings.map((meaning) => {
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

  return (
    <article
      data-testid={`library-sense-card-${meaning.entryId}`}
      data-entry-id={meaning.entryId}
      data-expanded={state.expanded ? "true" : "false"}
      tabIndex={state.expanded ? -1 : 0}
      role={state.expanded ? undefined : "button"}
      aria-expanded={state.expanded}
      onClick={activateCard}
      onKeyDown={(event) => {
        if (state.expanded) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateCard();
        }
      }}
      className={`relative rounded-[22px] border border-slate-300 bg-white px-[clamp(1rem,4cqw,1.25rem)] pt-5 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-[#20252f] dark:shadow-none ${
        state.expanded ? "pb-3" : "pb-4"
      }`}
    >
      {meaning.displayOrdinal != null ? (
        <span className="absolute -left-px -top-px flex h-5 w-5 -translate-x-[18%] -translate-y-[18%] items-center justify-center bg-slate-50 font-mono text-xs font-semibold text-indigo-600 dark:bg-[#11151d] dark:text-indigo-300">
          {meaning.displayOrdinal}
        </span>
      ) : null}

      <div>
        <div
          className="float-right mb-2 ml-3 flex shrink-0 items-center gap-2"
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
          {state.expanded ? (
            <button
              type="button"
              aria-label={t("senseCard.collapse")}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpanded();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-[#171b22] dark:text-slate-300"
            >
              ↑
            </button>
          ) : null}
        </div>

        {state.translationVisible && meaning.entryTranslation ? (
          <p className="mb-1 text-sm font-[650] text-amber-700 dark:text-[#dbc47e]">
            {meaning.entryTranslation}
          </p>
        ) : null}
        <p className="text-[14.5px] leading-[1.45] text-slate-800 dark:text-slate-100">
          {meaning.definition?.text ?? "—"}
        </p>
        {state.translationVisible && meaning.definition?.translation ? (
          <p className="mt-1 text-[12.5px] leading-[1.45] text-slate-500 dark:text-slate-400">
            {meaning.definition.translation}
          </p>
        ) : null}
        <div className="clear-both" />
        {meaning.definition?.children.length ? (
          <div className="mt-2 space-y-2 pl-4">
            {meaning.definition.children.map((child) => (
              <NestedContent
                key={child.contentNodeId}
                item={child}
                translationVisible={state.translationVisible}
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

        {state.expanded ? (
          <div className="mt-5" onClick={(event) => event.stopPropagation()}>
            {meaning.details.length ? (
              <div className="space-y-4">
                {meaning.details.map((item, index) => {
                  const presentation = contentPresentation[item.kind];
                  const previous = meaning.details[index - 1];
                  const showLabel =
                    presentation.labelKey &&
                    (!previous ||
                      contentPresentation[previous.kind].sectionGroup !==
                        presentation.sectionGroup);
                  return (
                    <section
                      key={item.contentNodeId}
                      data-content-kind={item.kind}
                    >
                      {showLabel && presentation.labelKey ? (
                        <ContentSectionHeader
                          label={t(presentation.labelKey)}
                          sectionGroup={presentation.sectionGroup}
                          count={
                            meaning.details.filter(
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
                      />
                      {item.children.length ? (
                        <div className="mt-2 space-y-2 pl-4">
                          {item.children.map((child) => (
                            <NestedContent
                              key={child.contentNodeId}
                              item={child}
                              translationVisible={state.translationVisible}
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
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
        ) : null}
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
}: {
  item: LibrarySenseCardModel["details"][number];
  translationVisible: boolean;
}) {
  return (
    <div data-content-kind={item.kind}>
      <ContentText item={item} translationVisible={translationVisible} />
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
      <p className={presentation.textClassName}>{item.text}</p>
      {translationVisible && item.translation ? (
        <p className="mt-1 text-[12.5px] leading-[1.45] text-slate-500 dark:text-slate-400">
          {item.translation}
        </p>
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
      ? BracesIcon
      : sectionGroup === "examples"
        ? ListIcon
        : sectionGroup === "idioms"
          ? QuoteIcon
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
    borderClassName: "border-l-[3px] border-amber-400",
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
    borderClassName: "border-l-[3px] border-violet-400",
    textClassName:
      "font-sense-serif text-base italic leading-[1.35] text-slate-700 dark:text-slate-200",
  },
  "idiom-explanation": {
    sectionGroup: "idioms",
    labelKey: null,
    borderClassName: "border-l-[3px] border-violet-300",
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

function BracesIcon({ className }: SmallIconProps) {
  return (
    <SmallIcon className={className}>
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
    </SmallIcon>
  );
}

function ListIcon({ className }: SmallIconProps) {
  return (
    <SmallIcon className={className}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </SmallIcon>
  );
}

function QuoteIcon({ className }: SmallIconProps) {
  return (
    <SmallIcon className={className}>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h3c0 3-1 5-4 6v2Z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h3c0 3-1 5-4 6v2Z" />
    </SmallIcon>
  );
}
