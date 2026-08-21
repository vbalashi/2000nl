"use client";

import React from "react";
import { areTrainingHotkeysSuspended } from "../trainingHotkeys";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingMode } from "@/lib/types";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  ExposureBadge,
  IdiomIcon,
  ListMarkerIcon,
  SenseCardReveal,
  SenseCardHeadwordLockup,
  SenseSectionHeader,
  UsagePatternIcon,
} from "../SenseCardChrome";
import type { PlatformSenseCardCapabilityV2 } from "../../../../../packages/shared/types/platformV2";
import type {
  TrainingSenseCardContent,
  TrainingSenseCardModel,
} from "./trainingSenseCardModel";

type Props = {
  model: TrainingSenseCardModel;
  mode: TrainingMode;
  interfaceLanguage: OnboardingLanguage;
  busy?: boolean;
  focusOnMount?: boolean;
  onPlayAudio?: () => void;
  onOpenDetails?: () => void;
  reportAction?: React.ReactNode;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
};

const reviewTone = {
  fail: "text-rose-600 before:bg-rose-400 dark:text-rose-300 dark:before:bg-rose-300",
  hard: "text-lime-700 before:bg-lime-500 dark:text-lime-300 dark:before:bg-lime-300",
  success:
    "text-emerald-700 before:bg-emerald-500 dark:text-emerald-300 dark:before:bg-emerald-300",
  easy: "text-teal-700 before:bg-teal-400 dark:text-teal-200 dark:before:bg-teal-200",
} as const;

export function TrainingSenseCardStage({
  model,
  mode,
  interfaceLanguage,
  busy = false,
  focusOnMount = false,
  onPlayAudio,
  onOpenDetails,
  reportAction,
  onAction,
}: Props) {
  const [answerVisible, setAnswerVisible] = React.useState(false);
  const [hintVisible, setHintVisible] = React.useState(false);
  const [translationVisible, setTranslationVisible] = React.useState(false);
  const stageRef = React.useRef<HTMLElement>(null);
  const primaryAnswerActionRef = React.useRef<HTMLButtonElement>(null);
  const showAnswerRef = React.useRef<HTMLButtonElement>(null);
  const previousAnswerVisibleRef = React.useRef(answerVisible);
  const [announcement, setAnnouncement] = React.useState("");
  const t = React.useCallback(
    (key: string) => platformV2Message(interfaceLanguage, key),
    [interfaceLanguage],
  );
  const hint = model.examples[0];
  const reversePrompt = model.definitions.find(
    (item) => item.kind === "definition",
  );
  const translationActionAvailable = Boolean(
    model.requestTranslationCapability,
  );

  React.useEffect(() => {
    if (!focusOnMount) return;
    window.requestAnimationFrame(() => stageRef.current?.focus());
  }, [focusOnMount]);

  React.useEffect(() => {
    setAnswerVisible(false);
    setHintVisible(false);
    setTranslationVisible(false);
  }, [model.entryId]);

  React.useEffect(() => {
    if (previousAnswerVisibleRef.current === answerVisible) return;
    previousAnswerVisibleRef.current = answerVisible;
    setAnnouncement(
      t(
        answerVisible ? "senseCard.answer.revealed" : "senseCard.answer.hidden",
      ),
    );
    window.requestAnimationFrame(() => {
      if (answerVisible) {
        primaryAnswerActionRef.current?.focus();
      }
      else showAnswerRef.current?.focus();
    });
  }, [answerVisible, t]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (areTrainingHotkeysSuspended()) return;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        busy
      ) {
        return;
      }
      const targetInsideStage =
        event.target instanceof Node && stageRef.current?.contains(event.target);
      if (isInteractiveTarget(event.target)) return;
      if (
        event.key === " " &&
        !event.shiftKey &&
        !isTextEntryTarget(event.target) &&
        targetInsideStage
      ) {
        event.preventDefault();
        setAnswerVisible((visible) => !visible);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "i" && !event.shiftKey && !answerVisible && hint) {
        event.preventDefault();
        setHintVisible((visible) => !visible);
        return;
      }
      if (key === "t" && answerVisible && hasTranslation(model)) {
        event.preventDefault();
        setTranslationVisible((visible) => !visible);
        return;
      }
      if (!answerVisible) return;
      const reviewResult = (
        {
          h: "fail",
          j: "hard",
          k: "success",
          l: "easy",
        } as const
      )[key as "h" | "j" | "k" | "l"];
      const capability = model.reviewCapabilities.find(
        (candidate) => candidate.reviewResult === reviewResult,
      );
      if (!capability) return;
      event.preventDefault();
      onAction(capability);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [answerVisible, busy, hint, model, onAction]);

  return (
    <section
      ref={stageRef}
      tabIndex={-1}
      aria-label={t("senseCard.training.cardChanged")}
      data-testid="training-sense-card-stage"
      data-side={answerVisible ? "answer" : "face"}
      className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col gap-3 text-slate-900 dark:text-slate-100 [@media(hover:hover)_and_(pointer:fine)]:justify-center [container-type:inline-size]"
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <article
        data-testid="training-sense-card-shell"
        className="relative flex min-h-0 max-h-none flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-300 bg-slate-50 shadow-[0_18px_55px_rgba(15,23,42,0.12)] dark:border-slate-600 dark:bg-[#1d222b] dark:shadow-[0_22px_70px_rgba(0,0,0,0.22)] [@media(hover:hover)_and_(pointer:fine)]:max-h-[500px]"
      >
        {model.audioCapability &&
        onPlayAudio &&
        (mode === "word-to-definition" || answerVisible) ? (
          <div
            data-testid="training-card-audio-corner"
            className="absolute left-5 top-5 z-20 sm:left-7 sm:top-7"
          >
            <IconButton
              label={t("senseCard.audio.play")}
              disabled={busy}
              onClick={onPlayAudio}
              compact
            >
              <SpeakerIcon />
            </IconButton>
          </div>
        ) : null}
        {answerVisible ? (
          <>
            <EntityHeader
              model={model}
              translationVisible={translationVisible}
              translationAvailable={
                hasTranslation(model) || translationActionAvailable
              }
              translationLabel={t("senseCard.translation.request")}
              busy={busy}
              moreLabel={t("senseCard.wordDetails.open")}
              onToggleTranslation={() => {
                if (!hasTranslation(model) && model.requestTranslationCapability) {
                  setTranslationVisible(true);
                  onAction(model.requestTranslationCapability);
                  return;
                }
                setTranslationVisible((visible) => !visible);
              }}
              onOpenDetails={onOpenDetails}
            />
            <AnswerBody
              model={model}
              translationVisible={translationVisible}
              interfaceLanguage={interfaceLanguage}
              onReachEnd={() => primaryAnswerActionRef.current?.focus()}
            />
          </>
        ) : (
          <FaceBody
            model={model}
            mode={mode}
            reversePrompt={reversePrompt}
            hint={hint}
            hintVisible={hintVisible}
            hintLabel={t("senseCard.hint.example")}
          />
        )}
      </article>

      <footer
        data-testid="training-sense-card-dock"
        className={`shrink-0 px-1 ${
          answerVisible
            ? model.reviewCapabilities.length
              ? "h-[104px] min-h-[104px] sm:h-[76px] sm:min-h-[76px]"
              : "h-[76px] min-h-[76px]"
            : reportAction || model.markKnownCapability
              ? "h-[76px] min-h-[76px]"
              : "h-11 min-h-11"
        }`}
      >
        {answerVisible ? (
          <AnswerDock
            model={model}
            busy={busy}
            interfaceLanguage={interfaceLanguage}
            primaryActionRef={primaryAnswerActionRef}
            onAction={onAction}
            reportAction={reportAction}
          />
        ) : (
          <FaceDock
            model={model}
            busy={busy}
            interfaceLanguage={interfaceLanguage}
            hintAvailable={Boolean(hint)}
            hintVisible={hintVisible}
            showHintLabel={t("senseCard.hint.show")}
            hideHintLabel={t("senseCard.hint.hide")}
            showAnswerLabel={t("senseCard.answer.show")}
            onToggleHint={() => setHintVisible((visible) => !visible)}
            onShowAnswer={() => setAnswerVisible(true)}
            showAnswerRef={showAnswerRef}
            onAction={onAction}
            reportAction={reportAction}
          />
        )}
      </footer>
    </section>
  );
}

function EntityHeader({
  model,
  translationVisible,
  translationAvailable,
  translationLabel,
  moreLabel,
  busy,
  onToggleTranslation,
  onOpenDetails,
}: {
  model: TrainingSenseCardModel;
  translationVisible: boolean;
  translationAvailable: boolean;
  translationLabel: string;
  moreLabel: string;
  busy: boolean;
  onToggleTranslation: () => void;
  onOpenDetails?: () => void;
}) {
  return (
    <header className="relative z-10 shrink-0 bg-slate-50 px-6 pb-5 pt-20 dark:bg-[#1d222b] sm:px-9 sm:pt-20">
      <div className="absolute right-5 top-5 flex shrink-0 items-center gap-2 sm:right-7 sm:top-7">
        {model.repeatCount > 0 ? (
          <ExposureBadge count={model.repeatCount} tone="light" />
        ) : null}
        {translationAvailable ? (
          <IconButton
            label={translationLabel}
            active={translationVisible}
            disabled={busy}
            onClick={onToggleTranslation}
          >
            <TranslateIcon />
          </IconButton>
        ) : null}
        {onOpenDetails ? (
          <IconButton
            label={moreLabel}
            disabled={busy}
            onClick={onOpenDetails}
          >
            <MoreIcon />
          </IconButton>
        ) : null}
      </div>
      <SenseCardHeadwordLockup
        article={model.article}
        headword={model.headword}
        partOfSpeech={model.partOfSpeech}
        coreVocabularyLabel={model.coreVocabularyLabel}
        tone="light"
      />
      {model.entryTranslation ? (
        <SenseCardReveal open={translationVisible}>
          <p
            data-testid="entry-translation"
            className="mt-2 text-sm font-[650] text-amber-700 dark:text-[#dbc47e]"
          >
            {[
              model.entryTranslation,
              ...(model.entryTranslationAlternatives ?? []),
            ].join(" · ")}
          </p>
        </SenseCardReveal>
      ) : null}
    </header>
  );
}

function FaceBody({
  model,
  mode,
  reversePrompt,
  hint,
  hintVisible,
  hintLabel,
}: {
  model: TrainingSenseCardModel;
  mode: TrainingMode;
  reversePrompt?: TrainingSenseCardContent;
  hint?: TrainingSenseCardContent;
  hintVisible: boolean;
  hintLabel: string;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-6 pb-6 pt-7 sm:px-9">
      <div className="grid min-h-0 flex-1 place-items-center px-10">
        <div className="flex flex-col items-center gap-4 text-center">
          {mode === "definition-to-word" ? (
            <>
              <p
                data-testid="reverse-prompt"
                className="max-w-[34rem] text-center font-sense-serif text-[clamp(1.55rem,5cqi,2.4rem)] leading-[1.22] text-slate-900 dark:text-slate-50"
              >
                {reversePrompt?.text}
              </p>
            </>
          ) : (
            <SenseCardHeadwordLockup
              article={model.article}
              headword={model.headword}
              tone="light"
              showMetadata={false}
            />
          )}
        </div>
      </div>
      {hint && hintVisible ? (
        <aside className="absolute inset-x-6 bottom-6 rounded-2xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[#191e27] sm:inset-x-9">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {hintLabel}
          </p>
          <p className="border-l-[3px] border-indigo-400 pl-3 font-sense-serif text-lg italic leading-7 text-slate-800 dark:text-slate-200">
            {hint.text}
          </p>
        </aside>
      ) : null}
    </div>
  );
}

function AnswerBody({
  model,
  translationVisible,
  interfaceLanguage,
  onReachEnd,
}: {
  model: TrainingSenseCardModel;
  translationVisible: boolean;
  interfaceLanguage: OnboardingLanguage;
  onReachEnd: () => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const continuationFocusPendingRef = React.useRef(false);
  const [scrollState, setScrollState] = React.useState({
    top: false,
    bottom: false,
  });
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  const definitions = model.definitions.filter(
    (item) => item.kind === "definition",
  );
  const usagePatterns = model.definitions.filter(
    (item) => item.kind === "usage-pattern",
  );
  const notes = model.definitions.filter((item) => item.kind === "usage-note");
  const examples = model.examples.filter((item) => item.kind === "example");
  const idioms = model.examples.filter(
    (item) => item.kind === "idiom" || item.kind === "idiom-explanation",
  );
  const updateScrollState = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
    setScrollState({
      top: node.scrollTop > 2,
      bottom: maxScroll - node.scrollTop > 2,
    });
  }, []);

  React.useLayoutEffect(() => {
    updateScrollState();
    const node = scrollRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [model.entryId, translationVisible, updateScrollState]);

  React.useEffect(() => {
    if (scrollState.bottom || !continuationFocusPendingRef.current) return;
    continuationFocusPendingRef.current = false;
    window.requestAnimationFrame(onReachEnd);
  }, [onReachEnd, scrollState.bottom]);

  const maskImage = scrollMask(scrollState.top, scrollState.bottom);
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="training-answer-scroll"
        data-scroll-top={scrollState.top ? "faded" : "clear"}
        data-scroll-bottom={scrollState.bottom ? "faded" : "clear"}
        onScroll={updateScrollState}
        style={{ maskImage, WebkitMaskImage: maskImage }}
        className="h-full overflow-y-auto px-6 pb-8 pt-4 [scrollbar-width:none] sm:px-9 [&::-webkit-scrollbar]:hidden"
      >
        {definitions.length ? (
          <div className="space-y-4 pt-2">
            {definitions.map((item) => (
              <ContentItem
                key={item.contentNodeId}
                item={item}
                translationVisible={translationVisible}
              />
            ))}
          </div>
        ) : null}
        {usagePatterns.length ? (
          <ContentSection
            section="usage"
            title={t("senseCard.sections.usagePattern")}
            count={usagePatterns.length}
            icon={<UsagePatternIcon className="h-3 w-3" />}
          >
            {usagePatterns.map((item) => (
              <ContentItem
                key={item.contentNodeId}
                item={item}
                translationVisible={translationVisible}
                accent="usage"
              />
            ))}
          </ContentSection>
        ) : null}
        {examples.length ? (
          <ContentSection
            section="examples"
            title={t("senseCard.sections.examples")}
            count={examples.length}
            icon={<ListMarkerIcon className="h-3 w-3" />}
          >
            {examples.map((item) => (
              <ContentItem
                key={item.contentNodeId}
                item={item}
                translationVisible={translationVisible}
                accent="example"
              />
            ))}
          </ContentSection>
        ) : null}
        {idioms.length ? (
          <ContentSection
            section="idioms"
            title={t("senseCard.sections.idioms")}
            count={idioms.length}
            icon={<IdiomIcon className="h-3 w-3" />}
          >
            {idioms.map((item) => (
              <ContentItem
                key={item.contentNodeId}
                item={item}
                translationVisible={translationVisible}
                accent="idiom"
              />
            ))}
          </ContentSection>
        ) : null}
        {notes.length ? (
          <ContentSection section="notes" title={t("senseCard.sections.notes")}>
            {notes.map((item) => (
              <ContentItem
                key={item.contentNodeId}
                item={item}
                translationVisible={translationVisible}
              />
            ))}
          </ContentSection>
        ) : null}
      </div>
      {scrollState.bottom ? (
        <button
          type="button"
          aria-label={t("senseCard.scroll.more")}
          onClick={() => {
            continuationFocusPendingRef.current = true;
            scrollRef.current?.scrollBy({
              top: Math.max(120, scrollRef.current.clientHeight * 0.65),
              behavior: "smooth",
            });
          }}
          className="absolute bottom-2 left-1/2 z-10 flex h-7 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-600 shadow-lg hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:bg-[#171b22]/95 dark:text-slate-300 dark:hover:border-slate-400 dark:hover:text-white"
        >
          <ChevronDownIcon />
        </button>
      ) : null}
    </div>
  );
}

function ContentSection({
  section,
  title,
  count,
  icon,
  children,
}: {
  section: "usage" | "examples" | "idioms" | "notes";
  title: string;
  count?: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0" data-section={section}>
      <SenseSectionHeader label={title} icon={icon} count={count} tone="light" />
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ContentItem({
  item,
  translationVisible,
  accent = "none",
}: {
  item: TrainingSenseCardContent;
  translationVisible: boolean;
  accent?: "none" | "usage" | "example" | "idiom";
}) {
  const literary =
    accent === "usage" || accent === "example" || accent === "idiom";
  const border =
    accent === "usage"
      ? "border-l-[3px] border-slate-400 pl-4 dark:border-slate-500"
      : accent === "example"
        ? "border-l-[3px] border-indigo-400 pl-4"
        : accent === "idiom"
          ? "border-l-[3px] border-amber-400 pl-4"
          : "";
  return (
    <div
      className={border}
      data-content-node-id={item.contentNodeId}
      data-parent-content-node-id={item.parentContentNodeId ?? undefined}
      data-content-kind={item.kind}
    >
      <div className="flex items-start gap-2">
        <p
          className={`min-w-0 flex-1 ${
            literary
              ? "font-sense-serif text-lg italic leading-7 text-slate-900 dark:text-slate-100"
              : "text-[17px] leading-7 text-slate-900 dark:text-slate-100"
          }`}
        >
          {item.text}
        </p>
      </div>
      {item.translation ? (
        <SenseCardReveal open={translationVisible}>
          <p
            data-content-translation="true"
            className="mt-1 text-[12.5px] leading-[1.45] text-slate-500 dark:text-slate-400"
          >
            {item.translation}
          </p>
        </SenseCardReveal>
      ) : null}
      {item.children?.length ? (
        <div className="mt-2 space-y-2 pl-4">
          {item.children.map((child) => (
            <ContentItem
              key={child.contentNodeId}
              item={child}
              translationVisible={translationVisible}
              accent={contentAccent(child.kind)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function contentAccent(
  kind: TrainingSenseCardContent["kind"],
): "none" | "usage" | "example" | "idiom" {
  if (kind === "usage-pattern") return "usage";
  if (kind === "example") return "example";
  if (kind === "idiom") return "idiom";
  return "none";
}

function FaceDock({
  model,
  busy,
  interfaceLanguage,
  hintAvailable,
  hintVisible,
  showHintLabel,
  hideHintLabel,
  showAnswerLabel,
  onToggleHint,
  onShowAnswer,
  showAnswerRef,
  onAction,
  reportAction,
}: {
  model: TrainingSenseCardModel;
  busy: boolean;
  interfaceLanguage: OnboardingLanguage;
  hintAvailable: boolean;
  hintVisible: boolean;
  showHintLabel: string;
  hideHintLabel: string;
  showAnswerLabel: string;
  onToggleHint: () => void;
  onShowAnswer: () => void;
  showAnswerRef: React.RefObject<HTMLButtonElement>;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
  reportAction?: React.ReactNode;
}) {
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex gap-3">
        {hintAvailable ? (
          <button
            type="button"
            aria-label={hintVisible ? hideHintLabel : showHintLabel}
            disabled={busy}
            onClick={onToggleHint}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-indigo-700 outline-none transition hover:bg-indigo-50 focus-visible:bg-indigo-100 disabled:opacity-50 dark:border-slate-600 dark:bg-[#171b22] dark:text-indigo-200 dark:hover:border-indigo-400/70 dark:hover:bg-[#201f36] dark:focus-visible:bg-[#252348]"
          >
            <HintIcon />
          </button>
        ) : null}
        <button
          ref={showAnswerRef}
          type="button"
          aria-label={showAnswerLabel}
          disabled={busy}
          onClick={onShowAnswer}
          className="h-11 flex-1 rounded-xl border border-indigo-400 bg-indigo-600 px-4 text-sm font-semibold text-white outline-none transition hover:bg-indigo-700 focus-visible:bg-indigo-700 disabled:opacity-50 dark:border-[#6259b2] dark:bg-[#292650] dark:text-indigo-50 dark:hover:bg-[#332f60] dark:focus-visible:bg-[#3a356b]"
        >
          <span>{showAnswerLabel}</span>
          <kbd className="ml-2 rounded border border-white/30 bg-black/10 px-1.5 py-0.5 text-[10px] font-medium text-white/90 dark:border-indigo-300/30 dark:bg-black/20 dark:text-indigo-100/80">
            Space
          </kbd>
        </button>
      </div>
      {reportAction || model.markKnownCapability ? (
        <div className="flex h-6 items-center justify-between gap-3 px-1 text-[11px] leading-none text-slate-500 dark:text-slate-400">
          {reportAction ?? <span />}
          {model.markKnownCapability ? (
            <MarkKnownAction
              capability={model.markKnownCapability}
              busy={busy}
              label={t(model.markKnownCapability.messageKey)}
              onAction={onAction}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AnswerDock({
  model,
  busy,
  interfaceLanguage,
  primaryActionRef,
  onAction,
  reportAction,
}: {
  model: TrainingSenseCardModel;
  busy: boolean;
  interfaceLanguage: OnboardingLanguage;
  primaryActionRef: React.RefObject<HTMLButtonElement>;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
  reportAction?: React.ReactNode;
}) {
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  if (model.isKnown && model.undoKnownCapability) {
    return (
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/60 bg-emerald-50 px-4 py-2 text-sm dark:bg-[#18352b]">
        <span className="inline-flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-200">
          <CheckIcon /> {t("senseCard.known.marked")}
        </span>
        <button
          ref={primaryActionRef}
          type="button"
          disabled={busy}
          onClick={() => onAction(model.undoKnownCapability!)}
          className="text-indigo-700 hover:text-indigo-900 disabled:opacity-50 dark:text-indigo-200 dark:hover:text-white"
        >
          {t(model.undoKnownCapability.messageKey)}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      {model.learnCapability ? (
        <button
          ref={primaryActionRef}
          type="button"
          disabled={busy}
          onClick={() => onAction(model.learnCapability!)}
          className="mx-auto block h-11 shrink-0 w-[94%] rounded-xl border border-indigo-400/60 bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-[#292650] dark:text-indigo-100 dark:hover:bg-[#332f60]"
        >
          {t(model.learnCapability.messageKey)}
        </button>
      ) : null}

      {model.reviewCapabilities.length ? (
        <div
          role="group"
          aria-label={t("senseCard.sections.reviewPrompt")}
          className="flex shrink-0 flex-col"
        >
          <div className="grid h-[74px] grid-cols-2 gap-1.5 sm:h-11 sm:grid-cols-4">
            {model.reviewCapabilities.map((capability, index) => (
              <button
                key={capability.reviewResult}
                ref={index === 0 ? primaryActionRef : undefined}
                type="button"
                disabled={busy}
                onClick={() => onAction(capability)}
                className={`relative min-h-[34px] overflow-hidden rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold outline-none transition before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r-full hover:bg-slate-100 focus-visible:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-[#171b22] dark:hover:bg-[#202630] dark:focus-visible:bg-[#202630] sm:h-11 ${reviewTone[capability.reviewResult]}`}
              >
                {t(capability.messageKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex h-6 min-h-6 shrink-0 items-center justify-between gap-3 px-1 text-[11px] leading-none text-slate-500 dark:text-slate-400">
        {reportAction ?? <span />}
        {model.markKnownCapability ? (
          <MarkKnownAction
            capability={model.markKnownCapability}
            busy={busy}
            label={t(model.markKnownCapability.messageKey)}
            onAction={onAction}
          />
        ) : null}
      </div>
    </div>
  );
}

function MarkKnownAction({
  capability,
  busy,
  label,
  onAction,
}: {
  capability: NonNullable<TrainingSenseCardModel["markKnownCapability"]>;
  busy: boolean;
  label: string;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onAction(capability)}
      className="flex h-6 min-h-6 items-center gap-2 rounded-lg px-2 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <CheckIcon /> {label}
    </button>
  );
}

function hasTranslation(model: TrainingSenseCardModel) {
  return Boolean(
    model.entryTranslation ||
    [...model.definitions, ...model.examples].some(hasContentTranslation),
  );
}

function hasContentTranslation(item: TrainingSenseCardContent): boolean {
  return Boolean(
    item.translation || item.children?.some(hasContentTranslation),
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "button, a, input, textarea, select, summary, [role='button'], [contenteditable='true']",
      ),
    )
  );
}

function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true'], [role='textbox']",
      ),
    )
  );
}

function scrollMask(top: boolean, bottom: boolean) {
  if (top && bottom) {
    return "linear-gradient(to bottom, transparent 0, black 18px, black calc(100% - 22px), transparent 100%)";
  }
  if (top) {
    return "linear-gradient(to bottom, transparent 0, black 18px, black 100%)";
  }
  if (bottom) {
    return "linear-gradient(to bottom, black 0, black calc(100% - 22px), transparent 100%)";
  }
  return "none";
}

function IconButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
  compact = false,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center rounded-xl border outline-none transition focus-visible:shadow-[inset_0_-3px_0_rgba(79,70,229,0.65)] disabled:opacity-50 dark:focus-visible:shadow-[inset_0_-3px_0_rgba(165,180,252,0.75)] ${
        compact ? "h-9 w-9" : "h-10 w-10"
      } ${
        active
          ? "border-slate-300 bg-indigo-100 text-indigo-700 dark:border-slate-600 dark:bg-indigo-400/10 dark:text-indigo-200"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

function SpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 9v6h4l5 4V5L9 9H5Z" />
      <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

function TranslateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 5h9M8.5 3v2M6 8c1.5 2.5 3.5 4.5 6 6M12 8c-1.5 3-4 5.5-7 7" />
      <path d="m14 19 3-8 3 8M15.2 16h3.6" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function HintIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M9 18h6M10 21h4" />
      <path d="M8.5 14.5C7.5 13.6 7 12.3 7 11a5 5 0 0 1 10 0c0 1.3-.5 2.6-1.5 3.5-.7.7-1.1 1.2-1.2 2.5h-4.6c-.1-1.3-.5-1.8-1.2-2.5Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
