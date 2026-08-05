"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
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

const reviewTone = {
  fail: "before:bg-rose-300 text-rose-700 dark:text-rose-300",
  hard: "before:bg-lime-300 text-lime-700 dark:text-lime-300",
  success: "before:bg-emerald-300 text-emerald-700 dark:text-emerald-300",
  easy: "before:bg-teal-200 text-teal-700 dark:text-teal-200",
} as const;

type Props = {
  model: LibrarySenseCardGroupModel;
  interfaceLanguage: OnboardingLanguage;
  busyIdentity?: string | null;
  audioBusy?: boolean;
  onPlayAudio?: () => void;
  translationEnabled?: boolean;
  translationStates?: Record<string, "pending" | "failed">;
  onRequestTranslation?: (entryId: string, cardTypeId: CardTypeId) => void;
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
  onRequestTranslation,
  onAction,
}: Props) {
  const [viewState, setViewState] = React.useState<LibrarySenseCardViewState>(
    () => initialViewState(model),
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

  return (
    <section
      data-testid="library-sense-card-group"
      className="h-full overflow-y-auto bg-slate-50 px-3 py-4 text-slate-900 dark:bg-[#11151d] dark:text-slate-100 sm:px-5"
    >
      <header className="mb-5 px-1 sm:px-2">
        <div className="flex min-w-0 items-baseline gap-2.5 font-serif">
          {model.article ? (
            <span className="shrink-0 text-2xl leading-none text-slate-500 dark:text-slate-400">
              {model.article}
            </span>
          ) : null}
          <h2 className="min-w-0 break-words text-[clamp(2.6rem,8vw,4rem)] font-normal leading-[0.92] tracking-[-0.035em]">
            {model.headword}
          </h2>
          {onPlayAudio && model.audioCapability ? (
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
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {model.partOfSpeech ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {model.partOfSpeech}
            </span>
          ) : null}
          {model.coreVocabularyLabel ? (
            <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-200">
              {model.coreVocabularyLabel}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mb-3 flex items-center gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 sm:px-2">
        <span>{model.meaningCountLabel}</span>
        <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-300 px-2 font-mono tracking-normal dark:border-slate-700">
          {model.senseCount}
        </span>
      </div>

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
              translationEnabled={translationEnabled}
              translationState={translationStates[identity] ?? null}
              onToggleExpanded={() =>
                updateEntry(identity, (current) => ({
                  ...current,
                  expanded: !current.expanded,
                }))
              }
              onToggleTranslation={() => {
                updateEntry(identity, (current) => ({
                  ...current,
                  translationVisible: !current.translationVisible,
                }));
                const hasCachedTranslation = Boolean(
                  meaning.entryTranslation ||
                  meaning.definition?.translation ||
                  meaning.details.some((item) => item.translation),
                );
                if (!hasCachedTranslation) {
                  onRequestTranslation?.(meaning.entryId, meaning.cardTypeId);
                }
              }}
              onAction={onAction}
            />
          );
        })}
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
  translationEnabled,
  translationState,
  onToggleExpanded,
  onToggleTranslation,
  onAction,
}: {
  meaning: LibrarySenseCardModel;
  groupPartOfSpeech: string | null;
  state: LibrarySenseCardViewState[string];
  interfaceLanguage: OnboardingLanguage;
  busy: boolean;
  translationEnabled: boolean;
  translationState: "pending" | "failed" | null;
  onToggleExpanded: () => void;
  onToggleTranslation: () => void;
  onAction: (capability: LibraryMutationCapability) => void;
}) {
  const t = (key: string, variables?: Record<string, string | number>) =>
    platformV2Message(interfaceLanguage, key, variables);
  const ordinal = meaning.displayOrdinal ?? 1;
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
      className="relative rounded-[22px] border border-slate-300 bg-white px-5 py-5 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-[#20252f] dark:shadow-none"
    >
      {meaning.displayOrdinal != null ? (
        <span className="absolute -left-px -top-px flex h-10 w-10 -translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-slate-50 font-mono text-lg text-indigo-600 dark:bg-[#11151d] dark:text-indigo-300">
          {meaning.displayOrdinal}
        </span>
      ) : null}

      <div className={meaning.displayOrdinal != null ? "pl-4" : ""}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            {state.translationVisible && meaning.entryTranslation ? (
              <p className="mb-1 font-serif text-base italic text-amber-700 dark:text-[#dbc47e]">
                {meaning.entryTranslation}
              </p>
            ) : null}
            <p className="text-base leading-6 text-slate-800 dark:text-slate-100">
              {meaning.definition?.text ?? "—"}
            </p>
            {state.translationVisible && meaning.definition?.translation ? (
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                {meaning.definition.translation}
              </p>
            ) : null}
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
          </div>
          {meaning.repeatCount > 0 ? (
            <span className="shrink-0 rounded-xl border border-slate-300 px-2.5 py-1 font-mono text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              ↔ {meaning.repeatCount}×
            </span>
          ) : (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {t("senseCard.state.new")}
            </span>
          )}
        </div>

        {meaning.partOfSpeech && meaning.partOfSpeech !== groupPartOfSpeech ? (
          <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {meaning.partOfSpeech}
          </div>
        ) : null}

        {state.expanded ? (
          <div className="mt-5" onClick={(event) => event.stopPropagation()}>
            {meaning.details.length ? (
              <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
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
                        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          {t(presentation.labelKey)}
                        </h3>
                      ) : null}
                      <p className={presentation.textClassName}>{item.text}</p>
                      {state.translationVisible && item.translation ? (
                        <p className="mt-1 pl-[15px] text-sm text-slate-500 dark:text-slate-400">
                          {item.translation}
                        </p>
                      ) : null}
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

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              {translationEnabled ? (
                <button
                  type="button"
                  aria-label={t("senseCard.translation.forMeaning", {
                    number: ordinal,
                  })}
                  aria-pressed={state.translationVisible}
                  onClick={onToggleTranslation}
                  disabled={translationState === "pending"}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-lg text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
                >
                  <TranslateIcon />
                </button>
              ) : null}
              <div className="min-w-[12rem] flex-1">
                <MeaningActions
                  meaning={meaning}
                  interfaceLanguage={interfaceLanguage}
                  busy={busy}
                  onAction={onAction}
                />
              </div>
              <button
                type="button"
                aria-label={t("senseCard.collapse")}
                onClick={onToggleExpanded}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-[#171b22] dark:text-slate-300"
              >
                ↑
              </button>
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
                    onClick={onToggleTranslation}
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

function MeaningActions({
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
        className="w-full rounded-xl border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50 dark:text-emerald-300"
      >
        {t(meaning.undoKnown.messageKey)}
      </button>
    );
  }
  if (meaning.reviewActions.length) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {meaning.reviewActions.map((action) => (
            <button
              key={action.reviewResult}
              type="button"
              disabled={busy}
              onClick={() => onAction(action)}
              className={`relative overflow-hidden rounded-xl border border-slate-300 px-2 py-2 text-sm font-semibold before:absolute before:inset-y-0 before:left-0 before:w-1 disabled:opacity-50 dark:border-slate-600 ${reviewTone[action.reviewResult]}`}
            >
              {t(action.messageKey)}
            </button>
          ))}
        </div>
        {meaning.markKnown ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(meaning.markKnown!)}
            className="w-full text-center text-xs text-slate-500 underline-offset-4 hover:underline disabled:opacity-50 dark:text-slate-400"
          >
            ✓ {t(meaning.markKnown.messageKey)}
          </button>
        ) : null}
      </div>
    );
  }
  if (!meaning.startLearning && !meaning.markKnown) return null;
  return (
    <div className="space-y-2">
      {meaning.startLearning ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(meaning.startLearning!)}
          className="w-full rounded-xl border border-indigo-500 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50 dark:text-indigo-200"
        >
          {t(meaning.startLearning.messageKey)}
        </button>
      ) : null}
      {meaning.markKnown ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(meaning.markKnown!)}
          className="w-full text-center text-xs text-slate-500 underline-offset-4 hover:underline dark:text-slate-400"
        >
          ✓ {t(meaning.markKnown.messageKey)}
        </button>
      ) : null}
    </div>
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
  const presentation = contentPresentation[item.kind];
  return (
    <div data-content-kind={item.kind}>
      <p className={presentation.textClassName}>{item.text}</p>
      {translationVisible && item.translation ? (
        <p className="mt-1 pl-[15px] text-sm text-slate-500 dark:text-slate-400">
          {item.translation}
        </p>
      ) : null}
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

function initialViewState(
  model: LibrarySenseCardGroupModel,
): LibrarySenseCardViewState {
  return reconcileLibrarySenseCardViewState({}, model.meanings);
}

const contentPresentation: Record<
  LibrarySenseCardModel["details"][number]["kind"],
  { sectionGroup: string; labelKey: string | null; textClassName: string }
> = {
  definition: {
    sectionGroup: "definition",
    labelKey: "senseCard.sections.definition",
    textClassName:
      "border-l-[3px] border-slate-400 pl-3 text-base leading-6 text-slate-700 dark:text-slate-200",
  },
  "usage-pattern": {
    sectionGroup: "usage",
    labelKey: "senseCard.sections.usagePattern",
    textClassName:
      "border-l-[3px] border-amber-400 pl-3 font-serif text-base italic leading-6 text-slate-700 dark:text-slate-200",
  },
  example: {
    sectionGroup: "examples",
    labelKey: "senseCard.sections.examples",
    textClassName:
      "border-l-[3px] border-indigo-400 pl-3 font-serif text-base italic leading-6 text-slate-700 dark:text-slate-200",
  },
  idiom: {
    sectionGroup: "idioms",
    labelKey: "senseCard.sections.idioms",
    textClassName:
      "border-l-[3px] border-violet-400 pl-3 font-serif text-base italic leading-6 text-slate-700 dark:text-slate-200",
  },
  "idiom-explanation": {
    sectionGroup: "idioms",
    labelKey: null,
    textClassName:
      "border-l-[3px] border-violet-300 pl-3 text-sm leading-5 text-slate-600 dark:text-slate-300",
  },
  "usage-note": {
    sectionGroup: "notes",
    labelKey: "senseCard.sections.notes",
    textClassName:
      "border-l-[3px] border-slate-400 pl-3 text-sm leading-5 text-slate-600 dark:text-slate-300",
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
