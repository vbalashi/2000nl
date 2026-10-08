"use client";
import React from "react";
import {
  ChevronDown,
  Languages,
  Lightbulb,
  MoreHorizontal,
  Volume2,
} from "lucide-react";
import approved from "../approvedTrainingCard.module.css";
import chrome from "@/components/practice/article/senseChrome.module.css";
import {ArticleContentNode,ArticleMeaningDetails} from "@/components/practice/article/ArticleContent";
import {ArticleSenseRelations} from "@/components/practice/article/ArticleWordDetails";
import {lexicalRelationDetail} from "@/components/practice/article/wordDetailsPresentation";
import {ProductionArticleReading} from "@/components/practice/article/ProductionArticleReading";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  ExposureBadge,
  SenseCardReveal,
  SenseCardHeadwordLockup,
} from "../SenseCardChrome";

import type {
  TrainingCardAnswer,
  TrainingCardPrompt,
} from "@/lib/training/exerciseCardPresentation";

export const approvedTrainingCardStageClassName =
  `mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col gap-[10px] font-sense-sans [container-type:inline-size] ${approved.stage}`;

/** Stage classes for the active presentation; approved screens use palette roles. */
export function trainingStageClassName() {
  return approvedTrainingCardStageClassName;
}

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
      className={`relative flex min-h-0 max-h-none flex-1 flex-col overflow-hidden ${approved.shell} ${answerVisible ? "gap-[6px] p-[18px]" : ""}`}
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
      <div className={approved.headerRow}>
        <div className={chrome.metadata}>
          {model.partOfSpeech ? (
            <span className={chrome.pos}>
              <span className={chrome.dot} />
              <span title={model.partOfSpeech}>
                {trainingPartOfSpeechLabel(model.partOfSpeech)}
              </span>
            </span>
          ) : null}
          {model.coreVocabularyLabel ? (
            <span className={chrome.badge}>
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
          {(
            <TrainingCardIconButton
              label={translationLabel}
              active={translationVisible}
              disabled={busy || !translationAvailable}
              onClick={onToggleTranslation}
            >
              <Languages aria-hidden="true" className="h-5 w-5" />
            </TrainingCardIconButton>
          )}
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
        plainHeadword={model.plainHeadword}
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
  partOfSpeech,
  recallTarget,
  contextLabel,
  hint,
  hintVisible,
  hintLabel,
  contentLabel,
}: {
  prompt: TrainingCardPrompt;
  label?: string;
  partOfSpeech?: string;
  recallTarget?: string;
  contextLabel?: string;
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
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[14px] outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--practice-focus,#818cf8)]"
    >
      <div className={approved.faceLayout}>
        <div className={approved.facePrelude}>
          {partOfSpeech ? (
            <span
              data-testid="training-face-part-of-speech"
              className={`${chrome.metadata} self-start mb-auto`}
            >
              <span className={chrome.pos}>
                <span aria-hidden="true" className={chrome.dot} />
                {trainingPartOfSpeechLabel(partOfSpeech)}
              </span>
            </span>
          ) : null}
          {label ? (
            <span className={approved.faceInstruction}>
              {label}
            </span>
          ) : null}
          {recallTarget ? <p data-testid="training-face-recall-target" className={approved.recallTarget}>{recallTarget}</p> : null}
          {contextLabel ? <p className={approved.faceInstruction}>{contextLabel}</p> : null}
        </div>
        <div className={approved.facePrompt} data-testid="training-main-prompt">
          {prompt.kind === "explanation" ? (
            <>
              <p
                data-testid="reverse-prompt"
                className={contextLabel ? approved.faceContext : "max-w-[34rem] text-center font-sense-serif text-[length:var(--reading-body-prompt-size,clamp(1.55rem,5cqi,2.4rem))] leading-[1.22] text-slate-900 dark:text-slate-50"}
              >
                {prompt.text}
              </p>
            </>
          ) : (
            <SenseCardHeadwordLockup
              article={prompt.article}
              headword={prompt.text}
              plainHeadword={prompt.plainText}
              tone="light"
              showMetadata={false}
              variant="training-face"
            />
          )}
        </div>
        {hint ? (
          <aside className={approved.faceHint} data-visible={hintVisible} aria-hidden={!hintVisible}>
            <p className={approved.faceHintLabel}>
              {hintLabel}
            </p>
            <p className={approved.faceHintText}>
              {hint.text}
            </p>
          </aside>
        ) : <div />}
      </div>
    </div>
  );
}

export function TrainingCardAnswerBody({
  model,
  translationVisible,
  interfaceLanguage,
  contentLanguage,
  translationLanguage,
  onReachEnd,
}: {
  model: TrainingCardAnswer;
  translationVisible: boolean;
  interfaceLanguage: OnboardingLanguage;
  contentLanguage?: string;
  translationLanguage?: string;
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
        role="region"
        aria-label={t("senseCard.training.content")}
        tabIndex={0}
        onKeyDown={event => {
          // Space scrolls reading content rather than turning the card over.
          if (event.key === " ") event.stopPropagation();
        }}
        data-scroll-top={scrollState.top ? "faded" : "clear"}
        data-scroll-bottom={scrollState.bottom ? "faded" : "clear"}
        onScroll={updateScrollState}
        style={{ maskImage, WebkitMaskImage: maskImage }}
        className={`h-full overflow-y-auto pb-5 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${approved.answerScroll}`}
      >
        <ProductionArticleReading>
          {definitions.map(node=><ArticleContentNode key={node.contentNodeId} node={node} lead interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage} translationLanguage={translationLanguage} translationVisible={translationVisible}/>)}
          <ArticleSenseRelations relation={lexicalRelationDetail(model.wordDetails)} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage}/>
          <ArticleMeaningDetails definition={null} details={[...usagePatterns,...examples,...idioms,...notes]} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage} translationLanguage={translationLanguage} translationVisible={translationVisible}/>
        </ProductionArticleReading>

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
          className={chrome.scrollCue}
        >
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
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
          className={approved.hint}
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
        className={`${approved.primary} flex-1`}
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
      className={`relative overflow-hidden rounded-xl border border-slate-300 bg-white px-2 font-bold outline-none transition before:absolute before:inset-y-0 before:left-0 before:w-1 hover:bg-slate-100 focus-visible:bg-slate-100 disabled:opacity-50 dark:border-[#7B8491] dark:bg-[#11141A] dark:hover:bg-[#202630] dark:focus-visible:bg-[#202630] h-[42px] text-xs ${reviewTone[result]}`}
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
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={chrome.iconAction}
    >
      {children}
    </button>
  );
}

export function TrainingCardSecondaryActions({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-testid="training-secondary-actions" className={approved.secondaryActions}>
      {children}
    </div>
  );
}
