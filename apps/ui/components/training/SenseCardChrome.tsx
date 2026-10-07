import {useTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
import React from "react";
import {useHeadwordFit} from "./useHeadwordFit";
import { Repeat2 } from "lucide-react";
import { HeadwordWithPronunciationBreaks } from "./HeadwordWithPronunciationBreaks";
import approvedCard from "./approvedTrainingCard.module.css";
import chrome from "@/components/practice/article/senseChrome.module.css";

type Tone = "light" | "dark";

/** Quiet action class for the active presentation (approved: palette roles and text scale). */
export function senseCardQuietAction() {
  return approvedCard.quietAction;
}

export function SenseCardHeadwordLockup({
  article,
  headword,
  plainHeadword,
  partOfSpeech,
  coreVocabularyLabel,
  tone,
  headerActions,
  showMetadata = true,
  variant = "default",
}: {
  article?: string | null;
  headword: string;
  plainHeadword?: string;
  partOfSpeech?: string | null;
  coreVocabularyLabel?: string | null;
  tone: Tone;
  headerActions?: React.ReactNode;
  showMetadata?: boolean;
  variant?: "default" | "training-face" | "training-answer" | "article";
}) {
  const {preferences} = useTrainingInteractions();
  const fit = useHeadwordFit(`${headword}:${plainHeadword}:${article}:${variant}:${preferences.syllableDoubleTap}:${preferences.showSyllables}`, !/\s/.test(headword.trim()), variant === "training-face");
  const longHeadword = headword.replaceAll("·", "").length > 18;
  const training = variant !== "default";
  const answer = variant === "training-answer";
  const trainingWordSize = variant === "article" ? "text-[length:var(--practice-text-headword,36px)]" : longHeadword
    ? "text-[length:var(--reading-headword-long-size,32px)] sm:text-[length:var(--reading-headword-long-size-sm,40px)]"
    : answer
      ? "text-[length:var(--reading-headword-answer-size,44px)]"
      : "text-[length:var(--reading-headword-face-size,48px)]";
  const primaryText = chrome.headword;
  const mutedText = chrome.article;
  const metadataVisible =
    showMetadata && Boolean(partOfSpeech || coreVocabularyLabel);

  return (
    <div className={`relative min-w-0 ${variant === "training-face" ? "w-full" : ""}`} data-testid="sense-card-headword-lockup">
      {metadataVisible || headerActions ? (
        <div
          className="flex min-h-8 min-w-0 items-center justify-between gap-3"
          data-testid="sense-card-header-row"
        >
          {metadataVisible ? (
            <div
              className={chrome.metadata}
              data-testid="sense-card-metadata"
            >
              {partOfSpeech ? (
                <span className={chrome.pos}>
                  <span className={chrome.dot} />
                  {partOfSpeech}
                </span>
              ) : null}
              {coreVocabularyLabel ? (
                <span
                  className={chrome.badge}
                >
                  {coreVocabularyLabel}
                </span>
              ) : null}
            </div>
          ) : (
            <span />
          )}
          {headerActions ? (
            <div
              className="flex shrink-0 items-center gap-2"
              data-testid="sense-card-header-actions"
            >
              {headerActions}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`flex min-w-0 items-start ${
          metadataVisible || headerActions ? "mt-3" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center font-sense-serif">
            <div
              ref={fit.row}
              className={`flex w-full min-w-0 items-baseline ${training ? `${trainingWordSize} ${variant === "article" ? "gap-[0.22em]" : "gap-[0.22rem]"}` : "gap-[0.22em]"} ${
                longHeadword ? "flex-1" : ""
              }`}
            >
              {article ? (
                <span
                  ref={fit.article}
                  className={`shrink-0 leading-none ${mutedText} ${
                    training
                      ? "pb-[0.16em] text-[0.5em]"
                      : "text-[1.35rem] sm:text-[1.5rem]"
                  }`}
                >
                  {article}
                </span>
              ) : null}
              <h2
                ref={fit.word}
                aria-label={plainHeadword ?? headword.replace(/[·ˈˌ]/g, "")}
                data-long-headword={longHeadword ? "true" : "false"}
                className={`${chrome.wordFit} min-w-0 break-words tracking-[-0.035em] ${primaryText} ${
                  training
                    ? variant === "article" ? "text-[length:var(--practice-text-headword,36px)] font-medium leading-[1.1]" : "text-[1em] font-medium leading-[1]"
                    : longHeadword
                      ? "text-[1.75rem] font-normal leading-[0.96] sm:text-[2.2rem]"
                      : "text-[2.65rem] font-normal leading-[0.92] sm:text-[3rem]"
                }`}
              >
                <HeadwordWithPronunciationBreaks text={headword} plainText={plainHeadword} />
              </h2>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SenseCardHeaderAction({
  label,
  accent = false,
  pressed,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  accent?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={chrome.headerAction}
    >
      {children}
    </button>
  );
}

export function SenseSectionHeader({
  label,
  icon,
  count,
  tone,
}: {
  label: string;
  icon?: React.ReactNode;
  count?: number;
  tone: Tone;
}) {
  return (
    <div
      data-testid="sense-section-header"
      className={chrome.section}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="shrink-0">{label}</span>
      <span
        className={chrome.sectionLine}
      />
      {typeof count === "number" ? (
        <span className={chrome.sectionCount}>{count}</span>
      ) : null}
    </div>
  );
}

export function SenseCardReveal({
  open,
  expandedClassName = "",
  children,
}: {
  open: boolean;
  expandedClassName?: string;
  children: React.ReactNode;
}) {
  const {preferences} = useTrainingInteractions();
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (contentRef.current) contentRef.current.inert = !open;
  }, [open]);
  return (
    <div
      aria-hidden={!open}
      className={`grid ${preferences.animation?"transition-[grid-template-rows,opacity,margin] duration-300 ease-out":"transition-none"} motion-reduce:transition-none ${
        open
          ? `grid-rows-[1fr] opacity-100 ${expandedClassName}`
          : "mt-0 grid-rows-[0fr] opacity-0"
      }`}
    >
      <div ref={contentRef} className="min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function ExposureBadge({ count, tone }: { count: number; tone: Tone }) {
  return (
    <span
      className={chrome.exposure}
      aria-label={`${count}×`}
    >
      <RepeatIcon className="h-3 w-3" />
      {count}×
    </span>
  );
}

export function LearningStateBadge({
  label,
  tone,
}: {
  label: string;
  tone: Tone;
}) {
  return (
    <span
      className={`${chrome.exposure} ${chrome.learningState}`}
    >
      <RepeatIcon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function SmallIcon({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function RepeatIcon({ className }: { className: string }) {
  return <Repeat2 aria-hidden="true" className={className} />;
}

export function ListMarkerIcon({ className }: { className: string }) {
  return (
    <SmallIcon className={className}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </SmallIcon>
  );
}

export function FlagIcon({ className }: { className: string }) {
  return (
    <SmallIcon className={className}>
      <path d="M5 21V4" />
      <path d="M5 5h10l-1.5 3L15 11H5" />
    </SmallIcon>
  );
}

export function UsagePatternIcon({ className }: { className: string }) {
  return (
    <SmallIcon className={className}>
      <path d="M8 4H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2" />
    </SmallIcon>
  );
}

export function IdiomIcon({ className }: { className: string }) {
  return (
    <SmallIcon className={className}>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h3c0 3-1 5-4 6v2Z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h3c0 3-1 5-4 6v2Z" />
    </SmallIcon>
  );
}

export function ChevronIcon({
  className,
  direction,
}: {
  className: string;
  direction: "up" | "down";
}) {
  return (
    <SmallIcon className={className}>
      <path d={direction === "up" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
    </SmallIcon>
  );
}

// Keep existing New callers on the same state-badge component.
export { LearningStateBadge as NewExposureBadge };
