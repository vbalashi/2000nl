import React from "react";
import { HeadwordWithPronunciationBreaks } from "./HeadwordWithPronunciationBreaks";

type Tone = "light" | "dark";

export function SenseCardHeadwordLockup({
  article,
  headword,
  partOfSpeech,
  coreVocabularyLabel,
  tone,
  inlineAction,
  topActions,
  showMetadata = true,
}: {
  article?: string | null;
  headword: string;
  partOfSpeech?: string | null;
  coreVocabularyLabel?: string | null;
  tone: Tone;
  inlineAction?: React.ReactNode;
  topActions?: React.ReactNode;
  showMetadata?: boolean;
}) {
  const longHeadword = headword.replaceAll("·", "").length > 18;
  const primaryText =
    tone === "dark" ? "text-slate-50" : "text-slate-900 dark:text-slate-100";
  const mutedText =
    tone === "dark" ? "text-slate-400" : "text-slate-500 dark:text-slate-400";

  return (
    <div className="relative min-w-0" data-testid="sense-card-headword-lockup">
      {topActions ? (
        <div className="absolute right-0 top-0 flex shrink-0 items-center gap-2">
          {topActions}
        </div>
      ) : null}
      {showMetadata && (partOfSpeech || coreVocabularyLabel) ? (
        <div
          className={`mb-2 flex min-h-5 flex-wrap items-center gap-2 text-[clamp(0.68rem,2.9cqw,0.78rem)] ${mutedText} ${
            topActions ? "pr-[clamp(5.5rem,24cqw,8rem)]" : ""
          }`}
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
      ) : null}

      <div className="flex min-w-0 items-start">
        <div className="min-w-0 flex-1">
          <div
            className={`flex min-w-0 items-center font-sense-serif ${
              topActions ? "pr-12" : ""
            }`}
          >
            <div
              className={`flex min-w-0 items-baseline gap-[0.22em] ${
                longHeadword ? "flex-1" : ""
              }`}
            >
              {article ? (
                <span
                  className={`shrink-0 text-[1.35rem] leading-none sm:text-[1.5rem] ${mutedText}`}
                >
                  {article}
                </span>
              ) : null}
              <h2
                aria-label={headword}
                data-long-headword={longHeadword ? "true" : "false"}
                className={`min-w-0 break-words font-normal tracking-[-0.035em] ${primaryText} ${
                  longHeadword
                    ? "text-[1.75rem] leading-[0.96] sm:text-[2.2rem]"
                    : "text-[2.65rem] leading-[0.92] sm:text-[3rem]"
                }`}
              >
                <HeadwordWithPronunciationBreaks text={headword} />
              </h2>
            </div>
            {inlineAction ? (
              <span className="ml-4 shrink-0">
                {inlineAction}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
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
  return (
    <SmallIcon className={className}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </SmallIcon>
  );
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
