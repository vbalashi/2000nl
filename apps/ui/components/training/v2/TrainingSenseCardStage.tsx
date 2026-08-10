"use client";

import React from "react";
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
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
};

const reviewTone = {
  fail: "text-rose-300 before:bg-rose-300",
  hard: "text-lime-300 before:bg-lime-300",
  success: "text-emerald-300 before:bg-emerald-300",
  easy: "text-teal-200 before:bg-teal-200",
} as const;

export function TrainingSenseCardStage({
  model,
  mode,
  interfaceLanguage,
  busy = false,
  focusOnMount = false,
  onPlayAudio,
  onOpenDetails,
  onAction,
}: Props) {
  const [answerVisible, setAnswerVisible] = React.useState(false);
  const [hintVisible, setHintVisible] = React.useState(false);
  const [translationVisible, setTranslationVisible] = React.useState(false);
  const stageRef = React.useRef<HTMLElement>(null);
  const answerPromptRef = React.useRef<HTMLParagraphElement>(null);
  const primaryAnswerActionRef = React.useRef<HTMLButtonElement>(null);
  const showAnswerRef = React.useRef<HTMLButtonElement>(null);
  const previousEntryIdRef = React.useRef(model.entryId);
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

  React.useEffect(() => {
    if (!focusOnMount) return;
    window.requestAnimationFrame(() => stageRef.current?.focus());
  }, [focusOnMount]);

  React.useEffect(() => {
    const entryChanged = previousEntryIdRef.current !== model.entryId;
    previousEntryIdRef.current = model.entryId;
    setAnswerVisible(false);
    setHintVisible(false);
    setTranslationVisible(false);
    if (entryChanged) {
      setAnnouncement(t("senseCard.training.cardChanged"));
      window.requestAnimationFrame(() => stageRef.current?.focus());
    }
  }, [model.entryId, t]);

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
        (answerPromptRef.current ?? primaryAnswerActionRef.current)?.focus();
      }
      else showAnswerRef.current?.focus();
    });
  }, [answerVisible, t]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        isInteractiveTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        busy
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (event.key === " ") {
        event.preventDefault();
        setAnswerVisible((visible) => !visible);
        return;
      }
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
      className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col gap-3 text-slate-100 sm:justify-center [container-type:inline-size]"
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <article
        data-testid="training-sense-card-shell"
        className="relative flex min-h-0 max-h-none flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-600 bg-[#1d222b] shadow-[0_22px_70px_rgba(0,0,0,0.22)] sm:max-h-[500px]"
      >
        {answerVisible ? (
          <>
            <EntityHeader
              model={model}
              translationVisible={translationVisible}
              translationAvailable={hasTranslation(model)}
              translationLabel={t("senseCard.translation.request")}
              audioLabel={t("senseCard.audio.play")}
              busy={busy}
              moreLabel={t("senseCard.wordDetails.open")}
              onToggleTranslation={() =>
                setTranslationVisible((visible) => !visible)
              }
              onPlayAudio={model.audioCapability ? onPlayAudio : undefined}
              onOpenDetails={onOpenDetails}
            />
            <AnswerBody
              model={model}
              translationVisible={translationVisible}
              interfaceLanguage={interfaceLanguage}
            />
          </>
        ) : (
          <FaceBody
            model={model}
            mode={mode}
            interfaceLanguage={interfaceLanguage}
            reversePrompt={reversePrompt}
            hint={hint}
            hintVisible={hintVisible}
            hintLabel={t("senseCard.hint.example")}
            audioLabel={t("senseCard.audio.play")}
            busy={busy}
            onPlayAudio={model.audioCapability ? onPlayAudio : undefined}
          />
        )}
      </article>

      <footer
        data-testid="training-sense-card-dock"
        className="h-[132px] min-h-[132px] shrink-0 px-1 sm:h-24 sm:min-h-24"
      >
        {answerVisible ? (
          <AnswerDock
            model={model}
            busy={busy}
            interfaceLanguage={interfaceLanguage}
            promptRef={answerPromptRef}
            primaryActionRef={primaryAnswerActionRef}
            onAction={onAction}
          />
        ) : (
          <FaceDock
            busy={busy}
            hintAvailable={Boolean(hint)}
            hintVisible={hintVisible}
            showHintLabel={t("senseCard.hint.show")}
            hideHintLabel={t("senseCard.hint.hide")}
            showAnswerLabel={t("senseCard.answer.show")}
            promptLabel={t("senseCard.answer.prompt")}
            onToggleHint={() => setHintVisible((visible) => !visible)}
            onShowAnswer={() => setAnswerVisible(true)}
            showAnswerRef={showAnswerRef}
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
  onToggleTranslation,
  onPlayAudio,
  onOpenDetails,
}: {
  model: TrainingSenseCardModel;
  translationVisible: boolean;
  translationAvailable: boolean;
  translationLabel: string;
  audioLabel: string;
  moreLabel: string;
  busy: boolean;
  onToggleTranslation: () => void;
  onPlayAudio?: () => void;
  onOpenDetails?: () => void;
}) {
  return (
    <header className="relative z-10 shrink-0 bg-[#1d222b] px-6 pb-2 pt-7 sm:px-9 sm:pt-8">
      <SenseCardHeadwordLockup
        article={model.article}
        headword={model.headword}
        partOfSpeech={model.partOfSpeech}
        coreVocabularyLabel={model.coreVocabularyLabel}
        tone="dark"
        inlineAction={
          onPlayAudio ? (
            <IconButton
              label={audioLabel}
              disabled={busy}
              onClick={onPlayAudio}
              compact
            >
              <SpeakerIcon />
            </IconButton>
          ) : null
        }
        topActions={
          <>
            {model.repeatCount > 0 ? (
              <ExposureBadge count={model.repeatCount} tone="dark" />
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
          </>
        }
      />
      {model.entryTranslation ? (
        <SenseCardReveal open={translationVisible}>
          <p
            data-testid="entry-translation"
            className="mt-2 font-sense-serif text-base italic text-[#dbc47e]"
          >
            {model.entryTranslation}
          </p>
        </SenseCardReveal>
      ) : null}
    </header>
  );
}

function FaceBody({
  model,
  mode,
  interfaceLanguage,
  reversePrompt,
  hint,
  hintVisible,
  hintLabel,
  audioLabel,
  busy,
  onPlayAudio,
}: {
  model: TrainingSenseCardModel;
  mode: TrainingMode;
  interfaceLanguage: OnboardingLanguage;
  reversePrompt?: TrainingSenseCardContent;
  hint?: TrainingSenseCardContent;
  hintVisible: boolean;
  hintLabel: string;
  audioLabel: string;
  busy: boolean;
  onPlayAudio?: () => void;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-6 pb-6 pt-7 sm:px-9">
      <div className="grid min-h-0 flex-1 place-items-center px-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {mode === "definition-to-word"
              ? platformV2Message(
                  interfaceLanguage,
                  "senseCard.answer.reversePrompt",
                )
              : platformV2Message(interfaceLanguage, "senseCard.answer.prompt")}
          </p>
          {mode === "definition-to-word" ? (
            <p
              data-testid="reverse-prompt"
              className="max-w-[34rem] text-center font-sense-serif text-[clamp(1.55rem,5cqi,2.4rem)] leading-[1.22] text-slate-50"
            >
              {reversePrompt?.text}
            </p>
          ) : (
            <SenseCardHeadwordLockup
              article={model.article}
              headword={model.headword}
              tone="dark"
              showMetadata={false}
              inlineAction={
                onPlayAudio ? (
                  <IconButton
                    label={audioLabel}
                    disabled={busy}
                    onClick={onPlayAudio}
                    compact
                  >
                    <SpeakerIcon />
                  </IconButton>
                ) : null
              }
            />
          )}
        </div>
      </div>
      {hint && hintVisible ? (
        <aside className="absolute inset-x-6 bottom-6 rounded-2xl border border-slate-700 bg-[#191e27] px-4 py-3 sm:inset-x-9">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {hintLabel}
          </p>
          <p className="border-l-[3px] border-indigo-400 pl-3 font-sense-serif text-lg italic leading-7 text-slate-200">
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
}: {
  model: TrainingSenseCardModel;
  translationVisible: boolean;
  interfaceLanguage: OnboardingLanguage;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
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
        className="h-full overflow-y-auto px-6 pb-8 pt-0 [scrollbar-width:none] sm:px-9 [&::-webkit-scrollbar]:hidden"
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
          onClick={() =>
            scrollRef.current?.scrollBy({
              top: Math.max(120, scrollRef.current.clientHeight * 0.65),
              behavior: "smooth",
            })
          }
          className="absolute bottom-2 left-1/2 z-10 flex h-7 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-slate-600 bg-[#171b22]/95 text-slate-300 shadow-lg hover:border-slate-400 hover:text-white"
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
      <SenseSectionHeader label={title} icon={icon} count={count} tone="dark" />
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
      ? "border-l-[3px] border-slate-500 pl-4"
      : accent === "example"
        ? "border-l-[3px] border-indigo-400 pl-4"
        : accent === "idiom"
          ? "border-l-[3px] border-amber-400 pl-4"
          : "";
  return (
    <div className={border}>
      <p
        className={
          literary
            ? "font-sense-serif text-lg italic leading-7 text-slate-100"
            : "text-[17px] leading-7 text-slate-100"
        }
      >
        {item.text}
      </p>
      {item.translation ? (
        <SenseCardReveal open={translationVisible}>
          <p
            data-content-translation="true"
            className="mt-1 font-sense-serif text-[15px] italic leading-6 text-slate-400"
          >
            {item.translation}
          </p>
        </SenseCardReveal>
      ) : null}
    </div>
  );
}

function FaceDock({
  busy,
  hintAvailable,
  hintVisible,
  showHintLabel,
  hideHintLabel,
  showAnswerLabel,
  promptLabel,
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
  promptLabel: string;
  onToggleHint: () => void;
  onShowAnswer: () => void;
  showAnswerRef: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex gap-3">
        {hintAvailable ? (
          <button
            type="button"
            aria-label={hintVisible ? hideHintLabel : showHintLabel}
            disabled={busy}
            onClick={onToggleHint}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-[#171b22] text-indigo-200 transition hover:border-indigo-400/70 hover:bg-[#201f36] disabled:opacity-50"
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
          className="h-14 flex-1 rounded-xl border border-[#6259b2] bg-[#292650] px-4 text-sm font-semibold text-indigo-50 transition hover:bg-[#332f60] disabled:opacity-50"
        >
          <span>{showAnswerLabel}</span>
          <kbd className="ml-2 rounded border border-indigo-300/30 bg-black/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-100/80">
            Space
          </kbd>
        </button>
      </div>
      <p className="sr-only">{promptLabel}</p>
    </div>
  );
}

function AnswerDock({
  model,
  busy,
  interfaceLanguage,
  promptRef,
  primaryActionRef,
  onAction,
}: {
  model: TrainingSenseCardModel;
  busy: boolean;
  interfaceLanguage: OnboardingLanguage;
  promptRef: React.RefObject<HTMLParagraphElement>;
  primaryActionRef: React.RefObject<HTMLButtonElement>;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
}) {
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  if (model.isKnown && model.undoKnownCapability) {
    return (
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/60 bg-[#18352b] px-4 py-2 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-emerald-200">
          <CheckIcon /> {t("senseCard.known.marked")}
        </span>
        <button
          ref={primaryActionRef}
          type="button"
          disabled={busy}
          onClick={() => onAction(model.undoKnownCapability!)}
          className="text-indigo-200 hover:text-white disabled:opacity-50"
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
          className="mx-auto block h-14 w-[94%] rounded-xl border border-indigo-400/60 bg-[#292650] text-sm font-semibold text-indigo-100 hover:bg-[#332f60] disabled:opacity-50"
        >
          {t(model.learnCapability.messageKey)}
        </button>
      ) : null}

      {model.reviewCapabilities.length ? (
        <div
          role="group"
          aria-labelledby="training-review-prompt"
          className="flex flex-1 flex-col gap-1.5"
        >
          <p
            ref={promptRef}
            id="training-review-prompt"
            tabIndex={-1}
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 outline-none"
          >
            {t("senseCard.sections.reviewPrompt")}
          </p>
          <div className="grid h-[84px] grid-cols-2 gap-2 sm:h-14 sm:grid-cols-4">
            {model.reviewCapabilities.map((capability) => (
              <button
                key={capability.reviewResult}
                type="button"
                disabled={busy}
                onClick={() => onAction(capability)}
                className={`relative min-h-[38px] overflow-hidden rounded-xl border border-slate-600 bg-[#171b22] px-2 text-xs font-semibold transition before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r-full hover:bg-[#202630] disabled:opacity-50 sm:h-14 ${reviewTone[capability.reviewResult]}`}
              >
                {t(capability.messageKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-3 items-center justify-between gap-3 px-1 text-[11px] leading-none text-slate-400">
        {model.reportCapabilities.length ? (
          <span
            className="inline-flex items-center gap-1.5 text-slate-500"
            aria-disabled="true"
          >
            <FlagIcon /> {t("senseCard.report")}
          </span>
        ) : (
          <span />
        )}
        {model.markKnownCapability ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(model.markKnownCapability!)}
            className="flex items-center gap-2 hover:text-slate-100 disabled:opacity-50"
          >
            <CheckIcon /> {t(model.markKnownCapability.messageKey)}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function hasTranslation(model: TrainingSenseCardModel) {
  return Boolean(
    model.entryTranslation ||
    [...model.definitions, ...model.examples].some((item) => item.translation),
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
      className={`flex shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-50 ${
        compact ? "h-9 w-9" : "h-10 w-10"
      } ${
        active
          ? "border-indigo-300 bg-indigo-400/10 text-indigo-200"
          : "border-slate-600 text-slate-300 hover:border-slate-400"
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

function FlagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M6 21V4m0 1h10l-2 3 2 3H6" />
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
