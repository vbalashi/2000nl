"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  ExposureBadge,
  FlagIcon,
  ListMarkerIcon,
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
  interfaceLanguage: OnboardingLanguage;
  busy?: boolean;
  onPlayAudio?: () => void;
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
  interfaceLanguage,
  busy = false,
  onPlayAudio,
  onAction,
}: Props) {
  const [answerVisible, setAnswerVisible] = React.useState(false);
  const [hintVisible, setHintVisible] = React.useState(false);
  const [translationVisible, setTranslationVisible] = React.useState(false);
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  const hint = model.examples[0];

  React.useEffect(() => {
    setAnswerVisible(false);
    setHintVisible(false);
    setTranslationVisible(false);
  }, [model.entryId]);

  return (
    <section
      data-testid="training-sense-card-stage"
      data-side={answerVisible ? "answer" : "face"}
      className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col gap-3 text-slate-100 [container-type:inline-size]"
    >
      <article
        data-testid="training-sense-card-shell"
        className="relative flex h-[clamp(360px,58dvh,500px)] min-h-[360px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-slate-600 bg-[#1d222b] shadow-[0_22px_70px_rgba(0,0,0,0.22)]"
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
              onToggleTranslation={() =>
                setTranslationVisible((visible) => !visible)
              }
              onPlayAudio={model.audioCapability ? onPlayAudio : undefined}
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
            hint={hint}
            hintVisible={hintVisible}
            hintLabel={t("senseCard.hint.example")}
            audioLabel={t("senseCard.audio.play")}
            busy={busy}
            onPlayAudio={model.audioCapability ? onPlayAudio : undefined}
          />
        )}
      </article>

      <footer className="h-[104px] min-h-[104px] shrink-0 px-1 sm:h-20 sm:min-h-20">
        {answerVisible ? (
          <AnswerDock
            model={model}
            busy={busy}
            interfaceLanguage={interfaceLanguage}
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
            onToggleHint={() => setHintVisible((visible) => !visible)}
            onShowAnswer={() => setAnswerVisible(true)}
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
  busy,
  onToggleTranslation,
  onPlayAudio,
}: {
  model: TrainingSenseCardModel;
  translationVisible: boolean;
  translationAvailable: boolean;
  translationLabel: string;
  audioLabel: string;
  busy: boolean;
  onToggleTranslation: () => void;
  onPlayAudio?: () => void;
}) {
  return (
    <header className="relative z-10 shrink-0 bg-[#1d222b] px-6 pb-4 pt-7 sm:px-9 sm:pt-8">
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
          </>
        }
      />
      {translationVisible && model.entryTranslation ? (
        <p
          data-testid="entry-translation"
          className="mt-2 font-sense-serif text-base italic text-[#dbc47e]"
        >
          {model.entryTranslation}
        </p>
      ) : null}
    </header>
  );
}

function FaceBody({
  model,
  hint,
  hintVisible,
  hintLabel,
  audioLabel,
  busy,
  onPlayAudio,
}: {
  model: TrainingSenseCardModel;
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
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2 [mask-image:linear-gradient(to_bottom,transparent_0,black_18px,black_calc(100%-22px),transparent_100%)] [scrollbar-width:none] sm:px-9 [&::-webkit-scrollbar]:hidden">
      {model.definitions.length ? (
        <div className="space-y-4 pt-3">
          {model.definitions.map((item) => (
            <ContentItem
              key={item.contentNodeId}
              item={item}
              translationVisible={translationVisible}
            />
          ))}
        </div>
      ) : null}
      {model.examples.length ? (
        <ContentSection
          title={t("senseCard.sections.examples")}
          count={model.examples.length}
          icon={<ListMarkerIcon className="h-3 w-3" />}
        >
          {model.examples.map((item) => (
            <ContentItem
              key={item.contentNodeId}
              item={item}
              translationVisible={translationVisible}
              example
            />
          ))}
        </ContentSection>
      ) : null}
    </div>
  );
}

function ContentSection({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0" data-section="examples">
      <SenseSectionHeader label={title} icon={icon} count={count} tone="dark" />
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ContentItem({
  item,
  translationVisible,
  example = false,
}: {
  item: TrainingSenseCardContent;
  translationVisible: boolean;
  example?: boolean;
}) {
  return (
    <div className={example ? "border-l-[3px] border-indigo-400 pl-4" : ""}>
      <p
        className={
          example
            ? "font-sense-serif text-lg italic leading-7 text-slate-100"
            : "text-[17px] leading-7 text-slate-100"
        }
      >
        {item.text}
      </p>
      {translationVisible && item.translation ? (
        <p
          data-content-translation="true"
          className="mt-1 font-sense-serif text-[15px] italic leading-6 text-slate-400"
        >
          {item.translation}
        </p>
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
  onToggleHint,
  onShowAnswer,
}: {
  busy: boolean;
  hintAvailable: boolean;
  hintVisible: boolean;
  showHintLabel: string;
  hideHintLabel: string;
  showAnswerLabel: string;
  onToggleHint: () => void;
  onShowAnswer: () => void;
}) {
  return (
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
        type="button"
        disabled={busy}
        onClick={onShowAnswer}
        className="h-14 flex-1 rounded-xl border border-[#6259b2] bg-[#292650] px-4 text-sm font-semibold text-indigo-50 transition hover:bg-[#332f60] disabled:opacity-50"
      >
        {showAnswerLabel}
      </button>
    </div>
  );
}

function AnswerDock({
  model,
  busy,
  interfaceLanguage,
  onAction,
}: {
  model: TrainingSenseCardModel;
  busy: boolean;
  interfaceLanguage: OnboardingLanguage;
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
          type="button"
          disabled={busy}
          onClick={() => onAction(model.learnCapability!)}
          className="mx-auto block h-14 w-[94%] rounded-xl border border-indigo-400/60 bg-[#292650] text-sm font-semibold text-indigo-100 hover:bg-[#332f60] disabled:opacity-50"
        >
          {t(model.learnCapability.messageKey)}
        </button>
      ) : null}

      {model.reviewCapabilities.length ? (
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
      ) : null}

      <div className="flex min-h-3 items-center justify-between gap-3 px-1 text-[11px] leading-none text-slate-400">
        {model.reportCapabilities[0] ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(model.reportCapabilities[0])}
            className="flex items-center gap-1.5 hover:text-slate-100 disabled:opacity-50"
          >
            <FlagIcon className="h-3.5 w-3.5" /> {t("senseCard.report")}
          </button>
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
