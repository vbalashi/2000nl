"use client";
import React from "react";
import {
  ChevronDown,
  Languages,
  Lightbulb,
  List,
  MoreHorizontal,
  Quote,
  Route,
  Volume2,
} from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  ExposureBadge,
  SenseCardReveal,
  SenseCardHeadwordLockup,
  SenseSectionHeader,
} from "../SenseCardChrome";
import type { TrainingSenseCardContent } from "./trainingSenseCardModel";

import type {
  TrainingCardAnswer,
  TrainingCardPrompt,
} from "@/lib/training/exerciseCardPresentation";

export const trainingCardStageClassName =
  "mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col gap-[10px] font-sense-sans text-slate-900 dark:text-[#F4F6FA] [container-type:inline-size]";

export function TrainingCardShell({
  answerVisible,
  children,
}: {
  answerVisible: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      data-testid="training-sense-card-shell"
      className={`relative flex min-h-0 max-h-none flex-1 flex-col overflow-hidden rounded-[14px] border border-slate-300 bg-slate-50 shadow-[0_18px_55px_rgba(15,23,42,0.12)] dark:border-[#4B5360] dark:bg-[#20252D] dark:shadow-none ${answerVisible ? "gap-[6px] p-[18px]" : ""}`}
    >
      {children}
    </article>
  );
}

const reviewTone = {
  fail: "text-rose-600 before:bg-rose-400 dark:text-rose-300 dark:before:bg-rose-300",
  hard: "text-lime-700 before:bg-lime-500 dark:text-lime-300 dark:before:bg-lime-300",
  success:
    "text-emerald-700 before:bg-emerald-500 dark:text-emerald-300 dark:before:bg-emerald-300",
  easy: "text-teal-700 before:bg-teal-400 dark:text-teal-200 dark:before:bg-teal-200",
} as const;

export function TrainingCardAnswerHeader({
  model,
  translationVisible,
  translationAvailable,
  translationLabel,
  audioLabel,
  moreLabel,
  busy,
  onPlayAudio,
  onToggleTranslation,
  onOpenDetails,
}: {
  model: TrainingCardAnswer;
  translationVisible: boolean;
  translationAvailable: boolean;
  translationLabel: string;
  audioLabel: string;
  moreLabel: string;
  busy: boolean;
  onPlayAudio?: () => void;
  onToggleTranslation: () => void;
  onOpenDetails?: () => void;
}) {
  return (
    <header className="relative z-10 flex shrink-0 flex-col gap-0">
      <div className="mb-2 flex min-h-[34px] items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-slate-500 dark:text-[#BFC7D4]">
          {model.partOfSpeech ? (
            <span className="inline-flex items-center gap-2 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-[#37D99B]" />
              <span title={model.partOfSpeech}>
                {trainingPartOfSpeechLabel(model.partOfSpeech)}
              </span>
            </span>
          ) : null}
          {model.coreVocabularyLabel ? (
            <span className="rounded-md bg-indigo-500/10 px-2 py-1 font-semibold text-indigo-700 dark:bg-[#262648] dark:text-[#9D94FF]">
              {model.coreVocabularyLabel}
            </span>
          ) : null}
          {model.repeatCount > 0 ? (
            <ExposureBadge count={model.repeatCount} tone="light" />
          ) : null}
        </div>
        <div
          data-testid="training-answer-header-actions"
          className="flex shrink-0 items-center gap-[7px]"
        >
          {onPlayAudio ? (
            <TrainingCardIconButton
              label={audioLabel}
              disabled={busy}
              onClick={onPlayAudio}
            >
              <Volume2 aria-hidden="true" className="h-5 w-5" />
            </TrainingCardIconButton>
          ) : null}
          {translationAvailable ? (
            <TrainingCardIconButton
              label={translationLabel}
              active={translationVisible}
              disabled={busy}
              onClick={onToggleTranslation}
            >
              <Languages aria-hidden="true" className="h-5 w-5" />
            </TrainingCardIconButton>
          ) : null}
          {onOpenDetails ? (
            <TrainingCardIconButton
              label={moreLabel}
              disabled={busy}
              onClick={onOpenDetails}
            >
              <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
            </TrainingCardIconButton>
          ) : null}
        </div>
      </div>
      <SenseCardHeadwordLockup
        article={model.article}
        headword={model.headword}
        tone="light"
        showMetadata={false}
        variant="training-answer"
      />
      {model.entryTranslation ? (
        <SenseCardReveal open={translationVisible}>
          <p
            data-testid="entry-translation"
            className="mt-0 text-[length:var(--reading-translation-emphasis-size,15px)] font-bold text-amber-700 dark:text-[#E9C46A]"
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

function trainingPartOfSpeechLabel(value: string) {
  return value === "zelfstandig naamwoord" || value === "substantief"
    ? "zn."
    : value === "bijvoeglijk naamwoord"
      ? "bn."
      : value;
}

export function TrainingCardFace({
  prompt,
  label,
  hint,
  hintVisible,
  hintLabel,
  contentLabel,
}: {
  prompt: TrainingCardPrompt;
  label?: string;
  hint?: { text: string };
  hintVisible: boolean;
  hintLabel: string;
  contentLabel: string;
}) {
  return (
    <div
      data-testid="training-face-scroll"
      role="region"
      aria-label={contentLabel}
      tabIndex={0}
      onKeyDown={(event) => {
        // Space scrolls a focused reading region; it must not reveal the answer.
        if (event.key === " ") event.stopPropagation();
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[14px] outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
    >
      <div className="flex min-h-full flex-col p-[18px]">
        <div className="my-auto flex shrink-0 flex-col items-center gap-4 px-10 py-3 text-center">
          {label ? (
            <span className="rounded-md bg-indigo-500/10 px-2 py-1 font-sense-sans text-xs font-semibold text-indigo-700 dark:bg-[#262648] dark:text-[#9D94FF]">
              {label}
            </span>
          ) : null}
          {prompt.kind === "explanation" ? (
            <>
              <p
                data-testid="reverse-prompt"
                className="max-w-[34rem] text-center font-sense-serif text-[length:var(--reading-body-prompt-size,clamp(1.55rem,5cqi,2.4rem))] leading-[1.22] text-slate-900 dark:text-slate-50"
              >
                {prompt.text}
              </p>
            </>
          ) : (
            <SenseCardHeadwordLockup
              article={prompt.article}
              headword={prompt.text}
              tone="light"
              showMetadata={false}
              variant="training-face"
            />
          )}
        </div>
        {hint && hintVisible ? (
          <aside className="mt-4 shrink-0 rounded-2xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[#191e27]">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {hintLabel}
            </p>
            <p className="border-l-[3px] border-indigo-400 pl-3 font-sense-serif text-[length:var(--reading-hint-size,18px)] italic leading-[var(--reading-hint-leading,28px)] text-slate-800 dark:text-slate-200">
              {hint.text}
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function TrainingCardAnswerBody({
  model,
  translationVisible,
  interfaceLanguage,
  onReachEnd,
}: {
  model: TrainingCardAnswer;
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
  }, [model, translationVisible, updateScrollState]);

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
        className="h-full overflow-y-auto pb-5 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {definitions.length ? (
          <div className="space-y-3 pt-1">
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
            icon={<Route aria-hidden="true" className="h-3 w-3" />}
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
            icon={<List aria-hidden="true" className="h-3 w-3" />}
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
            icon={<Quote aria-hidden="true" className="h-3 w-3" />}
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
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
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
    <section className="mt-4 first:mt-0" data-section={section}>
      <SenseSectionHeader
        label={title}
        icon={icon}
        count={count}
        tone="light"
      />
      <div className={section === "idioms" ? "space-y-5 pt-2" : "space-y-3"}>
        {children}
      </div>
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
  const nested = Boolean(item.parentContentNodeId);
  const nestedDefinition = nested && item.kind === "definition";
  const literary =
    accent === "usage" ||
    accent === "example" ||
    accent === "idiom" ||
    (nested && item.kind === "example");
  const border =
    accent === "usage"
      ? "border-l-[3px] border-slate-400 pl-4 dark:border-slate-500"
      : accent === "example"
        ? "border-l-[3px] border-indigo-400 pl-4"
        : accent === "idiom"
          ? "border-l-[3px] border-amber-400 pl-[10px]"
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
            nestedDefinition
              ? "font-sense-sans text-[length:var(--reading-nested-size,13px)] leading-[var(--reading-nested-leading,1.35)] text-slate-500 dark:text-[#BFC7D4]"
              : literary
                ? "font-sense-serif italic text-slate-900 dark:text-[#F4F6FA] text-[length:var(--reading-literary-size,16px)] leading-[var(--reading-literary-leading,1.4)]"
                : "font-sense-serif text-[length:var(--reading-body-size,16px)] leading-[var(--reading-body-leading,1.15)] text-slate-900 dark:text-[#F4F6FA]"
          }`}
        >
          {item.text}
        </p>
      </div>
      {item.translation ? (
        <SenseCardReveal open={translationVisible}>
          <p
            data-content-translation="true"
            className="mt-1 text-[length:var(--reading-translation-size,13px)] leading-[var(--reading-translation-leading,1.35)] text-slate-500 dark:text-[#BFC7D4]"
          >
            {item.translation}
          </p>
        </SenseCardReveal>
      ) : null}
      {item.children?.length ? (
        <div
          className={
            accent === "idiom" ? "mt-1 space-y-0.5 pl-0" : "mt-2 space-y-2 pl-4"
          }
        >
          {item.children.map((child) => (
            <ContentItem
              key={child.contentNodeId}
              item={child}
              translationVisible={translationVisible}
              accent="none"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TrainingCardFaceControls({
  busy,
  hintAvailable,
  hintVisible,
  showHintLabel,
  hideHintLabel,
  showAnswerLabel,
  onToggleHint,
  onShowAnswer,
  showAnswerRef,
}: {
  busy: boolean;
  hintAvailable: boolean;
  hintVisible: boolean;
  showHintLabel: string;
  hideHintLabel: string;
  showAnswerLabel: string;
  onToggleHint: () => void;
  onShowAnswer: () => void;
  showAnswerRef: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <div className="flex gap-2">
      {hintAvailable ? (
        <button
          type="button"
          aria-label={hintVisible ? hideHintLabel : showHintLabel}
          disabled={busy}
          onClick={onToggleHint}
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-indigo-700 outline-none transition hover:bg-indigo-50 focus-visible:bg-indigo-100 disabled:opacity-50 dark:border-[#7B8491] dark:bg-[#171B22] dark:text-[#9D94FF] dark:hover:border-indigo-400/70 dark:hover:bg-[#201f36] dark:focus-visible:bg-[#252348]"
        >
          <Lightbulb aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : null}
      <button
        ref={showAnswerRef}
        type="button"
        aria-label={showAnswerLabel}
        disabled={busy}
        onClick={onShowAnswer}
        className="h-[46px] flex-1 rounded-xl border border-indigo-400 bg-indigo-600 px-4 text-sm font-bold text-white outline-none transition hover:bg-indigo-700 focus-visible:bg-indigo-700 disabled:opacity-50 dark:border-[#8B89F6] dark:bg-[#262648] dark:text-[#F4F6FA] dark:hover:bg-[#332f60] dark:focus-visible:bg-[#3a356b]"
      >
        <span>{showAnswerLabel}</span>
      </button>
    </div>
  );
}
export function TrainingCardReviewButton({
  result,
  label,
  busy,
  onClick,
  buttonRef,
}: {
  result: keyof typeof reviewTone;
  label: string;
  busy: boolean;
  onClick: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`relative h-[42px] overflow-hidden rounded-xl border border-slate-300 bg-white px-2 text-xs font-bold outline-none transition before:absolute before:inset-y-0 before:left-0 before:w-1 hover:bg-slate-100 focus-visible:bg-slate-100 disabled:opacity-50 dark:border-[#7B8491] dark:bg-[#11141A] dark:hover:bg-[#202630] dark:focus-visible:bg-[#202630] ${reviewTone[result]}`}
    >
      {label}
    </button>
  );
}
export const trainingReviewGridClassName =
  "grid h-[90px] grid-cols-2 grid-rows-2 gap-[6px] sm:h-[42px] sm:grid-cols-4 sm:grid-rows-1";
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

export function TrainingCardIconButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border outline-none transition focus-visible:shadow-[inset_0_-3px_0_rgba(79,70,229,0.65)] disabled:opacity-50 dark:focus-visible:shadow-[inset_0_-3px_0_rgba(165,180,252,0.75)] ${
        active
          ? "border-slate-300 bg-indigo-100 text-indigo-700 dark:border-slate-600 dark:bg-indigo-400/10 dark:text-indigo-200"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}
