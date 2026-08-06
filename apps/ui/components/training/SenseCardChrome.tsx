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
    <div className="min-w-0" data-testid="sense-card-headword-lockup">
      {showMetadata && (partOfSpeech || coreVocabularyLabel) ? (
        <div
          className={`mb-2 flex min-h-5 flex-wrap items-center gap-2 text-[clamp(0.68rem,2.9cqw,0.78rem)] ${mutedText}`}
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
                  : "bg-indigo-500/10 text-indigo-700"
              }`}
            >
              {coreVocabularyLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-[0.22em] font-serif">
            {article ? (
              <span
                className={`shrink-0 text-[clamp(1.35rem,6cqw,2rem)] leading-none ${mutedText}`}
              >
                {article}
              </span>
            ) : null}
            <h2
              aria-label={headword}
              data-long-headword={longHeadword ? "true" : "false"}
              className={`min-w-0 break-words font-normal tracking-[-0.035em] ${primaryText} ${
                longHeadword
                  ? "text-[clamp(1.55rem,7.4cqw,3.15rem)] leading-[0.96]"
                  : "text-[clamp(2.65rem,11cqw,4rem)] leading-[0.92]"
              }`}
            >
              <HeadwordWithPronunciationBreaks text={headword} />
            </h2>
            {inlineAction ? (
              <span className="mb-[0.16em] shrink-0 self-end">
                {inlineAction}
              </span>
            ) : null}
          </div>
        </div>
        {topActions ? (
          <div className="flex shrink-0 items-center gap-2">{topActions}</div>
        ) : null}
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

export function ExposureBadge({ count, tone }: { count: number; tone: Tone }) {
  return (
    <span
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-xs ${
        tone === "dark"
          ? "border-slate-700 text-slate-400"
          : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
      }`}
      aria-label={`${count}×`}
    >
      <RepeatIcon className="h-3.5 w-3.5" />
      {count}×
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
