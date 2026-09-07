import React from "react";
import { Repeat2 } from "lucide-react";
import { HeadwordWithPronunciationBreaks } from "./HeadwordWithPronunciationBreaks";

type Tone = "light" | "dark";

// Shared Training dock treatment: a quiet text action with a visible keyboard focus.
export const senseCardQuietActionClassName =
  "inline-flex h-6 min-h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border-0 bg-transparent px-0 font-sense-sans text-[11.5px] font-normal leading-none text-slate-500 outline-none hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 dark:text-[#7B8694] dark:hover:text-slate-100";

export function SenseCardHeadwordLockup({
  article,
  headword,
  partOfSpeech,
  coreVocabularyLabel,
  tone,
  headerActions,
  showMetadata = true,
  variant = "default",
}: {
  article?: string | null;
  headword: string;
  partOfSpeech?: string | null;
  coreVocabularyLabel?: string | null;
  tone: Tone;
  headerActions?: React.ReactNode;
  showMetadata?: boolean;
  variant?: "default" | "training-face" | "training-answer";
}) {
  const longHeadword = headword.replaceAll("·", "").length > 18;
  const training = variant !== "default";
  const answer = variant === "training-answer";
  const trainingWordSize = longHeadword
    ? "text-[length:var(--reading-headword-long-size,32px)] sm:text-[length:var(--reading-headword-long-size-sm,40px)]"
    : answer
      ? "text-[length:var(--reading-headword-answer-size,44px)]"
      : "text-[length:var(--reading-headword-face-size,48px)]";
  const primaryText =
    tone === "dark" ? "text-slate-50" : "text-slate-900 dark:text-slate-100";
  const mutedText =
    tone === "dark" ? "text-slate-400" : "text-slate-500 dark:text-slate-400";
  const metadataVisible =
    showMetadata && Boolean(partOfSpeech || coreVocabularyLabel);

  return (
    <div className="relative min-w-0" data-testid="sense-card-headword-lockup">
      {metadataVisible || headerActions ? (
        <div
          className="flex min-h-10 min-w-0 items-start justify-between gap-3"
          data-testid="sense-card-header-row"
        >
          {metadataVisible ? (
            <div
              className={`flex min-h-5 min-w-0 flex-wrap items-center gap-2 pt-0.5 text-[clamp(0.68rem,2.9cqw,0.78rem)] ${mutedText}`}
              data-testid="sense-card-metadata"
            >
              {partOfSpeech ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {partOfSpeech}
                </span>
              ) : null}
              {coreVocabularyLabel ? (
                <span
                  className={`rounded-md px-2 py-0.5 font-semibold ${
                    tone === "dark"
                      ? "bg-indigo-400/10 text-indigo-200"
                      : "bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200"
                  }`}
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
              className={`flex min-w-0 items-baseline ${training ? `${trainingWordSize} gap-[0.22rem]` : "gap-[0.22em]"} ${
                longHeadword ? "flex-1" : ""
              }`}
            >
              {article ? (
                <span
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
                aria-label={headword}
                data-long-headword={longHeadword ? "true" : "false"}
                className={`min-w-0 break-words tracking-[-0.035em] ${primaryText} ${
                  training
                    ? "text-[1em] font-medium leading-[1]"
                    : longHeadword
                      ? "text-[1.75rem] font-normal leading-[0.96] sm:text-[2.2rem]"
                      : "text-[2.65rem] font-normal leading-[0.92] sm:text-[3rem]"
                }`}
              >
                <HeadwordWithPronunciationBreaks text={headword} />
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
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 ${
        accent
          ? "border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-400/10"
          : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
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
      className="mb-2 flex items-center gap-2 text-[clamp(0.56rem,2.25cqw,0.66rem)] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400"
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="shrink-0">{label}</span>
      <span
        className={`h-px flex-1 ${
          tone === "dark"
            ? "bg-slate-700/55"
            : "bg-slate-300/60 dark:bg-slate-700/55"
        }`}
      />
      {typeof count === "number" ? (
        <span className="font-mono font-medium tracking-normal">{count}</span>
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
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (contentRef.current) contentRef.current.inert = !open;
  }, [open]);
  return (
    <div
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
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
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 font-mono text-[10px] ${
        tone === "dark"
          ? "border-slate-700 text-slate-400"
          : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
      }`}
      aria-label={`${count}×`}
    >
      <RepeatIcon className="h-3 w-3" />
      {count}×
    </span>
  );
}

export function NewExposureBadge({
  label,
  tone,
}: {
  label: string;
  tone: Tone;
}) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] ${
        tone === "dark"
          ? "border-slate-700 text-slate-400"
          : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
      }`}
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
