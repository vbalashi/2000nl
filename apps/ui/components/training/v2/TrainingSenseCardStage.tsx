"use client";

import React from "react";
import {
  Check,
  ChevronDown,
  Languages,
  Lightbulb,
  List,
  MoreHorizontal,
  Quote,
  Route,
  Volume2,
} from "lucide-react";
import { areTrainingHotkeysSuspended } from "../trainingHotkeys";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingMode } from "@/lib/types";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  ExposureBadge,
  SenseCardReveal,
  SenseCardHeadwordLockup,
  SenseSectionHeader,
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
  side: "face" | "answer";
  onSideChange: (side: "face" | "answer") => void;
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
  side,
  onSideChange,
  onAction,
}: Props) {
  const answerVisible = side === "answer";
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
        onSideChange(answerVisible ? "face" : "answer");
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
  }, [answerVisible, busy, hint, model, onAction, onSideChange]);

  return (
    <section
      ref={stageRef}
      tabIndex={-1}
      aria-label={t("senseCard.training.cardChanged")}
      data-testid="training-sense-card-stage"
      data-side={answerVisible ? "answer" : "face"}
      data-visual-spec="training-v1.0"
      className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col gap-[10px] font-sense-sans text-slate-900 dark:text-[#F4F6FA] [container-type:inline-size]"
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <article
        data-testid="training-sense-card-shell"
        className={`relative flex min-h-0 max-h-none flex-1 flex-col overflow-hidden rounded-[14px] border border-slate-300 bg-slate-50 shadow-[0_18px_55px_rgba(15,23,42,0.12)] dark:border-[#4B5360] dark:bg-[#20252D] dark:shadow-none ${
          answerVisible ? "gap-[6px] p-[18px]" : ""
        }`}
      >
        {model.audioCapability &&
        onPlayAudio &&
        mode === "word-to-definition" &&
        !answerVisible ? (
          <div
            data-testid="training-card-audio-corner"
            className="absolute right-[18px] top-[18px] z-20"
          >
            <IconButton
              label={t("senseCard.audio.play")}
              disabled={busy}
              onClick={onPlayAudio}
            >
              <Volume2 aria-hidden="true" className="h-5 w-5" />
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
              audioLabel={t("senseCard.audio.play")}
              busy={busy}
              moreLabel={t("senseCard.wordDetails.open")}
              onPlayAudio={onPlayAudio}
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
        className={`shrink-0 ${
          answerVisible
            ? model.reviewCapabilities.length
              ? "h-[120px] min-h-[120px] sm:h-[76px] sm:min-h-[76px]"
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
            onShowAnswer={() => onSideChange("answer")}
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
  audioLabel,
  moreLabel,
  busy,
  onPlayAudio,
  onToggleTranslation,
  onOpenDetails,
}: {
  model: TrainingSenseCardModel;
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
      <div className="flex min-h-[34px] items-center justify-between gap-2">
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
          <IconButton
            label={audioLabel}
            disabled={busy}
            onClick={onPlayAudio}
          >
            <Volume2 aria-hidden="true" className="h-5 w-5" />
          </IconButton>
        ) : null}
        {translationAvailable ? (
          <IconButton
            label={translationLabel}
            active={translationVisible}
            disabled={busy}
            onClick={onToggleTranslation}
          >
            <Languages aria-hidden="true" className="h-5 w-5" />
          </IconButton>
        ) : null}
        {onOpenDetails ? (
          <IconButton
            label={moreLabel}
            disabled={busy}
            onClick={onOpenDetails}
          >
            <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
          </IconButton>
        ) : null}
        </div>
      </div>
      <SenseCardHeadwordLockup
        article={model.article}
        headword={model.headword}
        tone="light"
        showMetadata={false}
        variant="training"
      />
      {model.entryTranslation ? (
        <SenseCardReveal open={translationVisible}>
          <p
            data-testid="entry-translation"
            className="mt-0 text-[15px] font-bold text-amber-700 dark:text-[#E9C46A]"
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
    <div className="relative flex min-h-0 flex-1 flex-col p-[18px]">
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
              variant="training"
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
      <SenseSectionHeader label={title} icon={icon} count={count} tone="light" />
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
  const compactIdiomLine = accent === "idiom" || (nested && item.kind === "example");
  const compactExampleLine = accent === "example";
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
              ? "font-sense-sans text-[13px] leading-[1.35] text-slate-500 dark:text-[#BFC7D4]"
              : literary
              ? `font-sense-serif italic text-slate-900 dark:text-[#F4F6FA] ${
                  compactExampleLine
                    ? "text-[13px] leading-[1.4]"
                    : compactIdiomLine
                    ? "text-[14px] leading-[1.25]"
                    : "text-[16px] leading-[1.4]"
                }`
              : "font-sense-serif text-[16px] leading-[1.15] text-slate-900 dark:text-[#F4F6FA]"
          }`}
        >
          {item.text}
        </p>
      </div>
      {item.translation ? (
        <SenseCardReveal open={translationVisible}>
          <p
            data-content-translation="true"
            className="mt-1 text-[13px] leading-[1.35] text-slate-500 dark:text-[#BFC7D4]"
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
    <div className="flex h-full flex-col gap-[6px]">
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
      {reportAction || model.markKnownCapability ? (
        <div className="flex h-6 items-end justify-between gap-3 text-[11.5px] leading-none text-slate-500 dark:text-[#7B8694]">
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
          <Check aria-hidden="true" className="h-4 w-4" /> {t("senseCard.known.marked")}
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
          <div
            data-testid="training-review-grid"
            className="grid h-[90px] grid-cols-2 grid-rows-2 gap-[6px] sm:h-[42px] sm:grid-cols-4 sm:grid-rows-1"
          >
            {model.reviewCapabilities.map((capability, index) => (
              <button
                key={capability.reviewResult}
                ref={index === 0 ? primaryActionRef : undefined}
                type="button"
                disabled={busy}
                onClick={() => onAction(capability)}
                className={`relative h-[42px] overflow-hidden rounded-xl border border-slate-300 bg-white px-2 text-xs font-bold outline-none transition before:absolute before:inset-y-0 before:left-0 before:w-1 hover:bg-slate-100 focus-visible:bg-slate-100 disabled:opacity-50 dark:border-[#7B8491] dark:bg-[#11141A] dark:hover:bg-[#202630] dark:focus-visible:bg-[#202630] ${reviewTone[capability.reviewResult]}`}
              >
                {t(capability.messageKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex h-6 min-h-6 shrink-0 items-end justify-between gap-3 text-[11.5px] leading-none text-slate-500 dark:text-[#7B8694]">
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
      className="flex h-6 min-h-6 items-center gap-1.5 rounded-lg px-0 hover:text-slate-900 disabled:opacity-50 dark:hover:text-slate-100"
    >
      <Check aria-hidden="true" className="h-4 w-4" /> {label}
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
