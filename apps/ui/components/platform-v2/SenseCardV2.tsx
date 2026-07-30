"use client";

import React from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  LanguageIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../packages/shared/types/platformV2";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

type Props = {
  group: PlatformHeadwordGroupV2;
  entry: PlatformSenseCardEntryV2;
  interfaceLanguage: OnboardingLanguage;
  translationVisible: boolean;
  busy?: boolean;
  onToggleTranslation: () => void;
  onPlayAudio?: () => void;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
};

const reviewOrder = ["fail", "hard", "success", "easy"] as const;

const reviewTone: Record<(typeof reviewOrder)[number], string> = {
  fail: "text-rose-300 before:bg-rose-300",
  hard: "text-lime-300 before:bg-lime-300",
  success: "text-emerald-300 before:bg-emerald-300",
  easy: "text-teal-200 before:bg-teal-200",
};

export function SenseCardV2({
  group,
  entry,
  interfaceLanguage,
  translationVisible,
  busy = false,
  onToggleTranslation,
  onPlayAudio,
  onAction,
}: Props) {
  const t = (key: string, variables?: Record<string, string | number>) =>
    platformV2Message(interfaceLanguage, key, variables);
  const capabilities = entry.capabilities;
  const action = (actionId: PlatformSenseCardCapabilityV2["actionId"]) =>
    capabilities.find((capability) => capability.actionId === actionId);
  const reviews = reviewOrder
    .map((result) =>
      capabilities.find(
        (capability) =>
          capability.actionId === "review-card" &&
          capability.reviewResult === result,
      ),
    )
    .filter(
      (capability): capability is Extract<
        PlatformSenseCardCapabilityV2,
        { actionId: "review-card" }
      > => Boolean(capability),
    );
  const learn = action("start-learning");
  const markKnown = action("mark-known");
  const undoKnown = action("undo-known");
  const isKnown = Boolean(entry.card?.knownMark);
  const definitionNodes = entry.contentNodes.filter(
    (node) =>
      node.kind === "definition" ||
      node.kind === "usage-pattern" ||
      node.kind === "usage-note",
  );
  const exampleNodes = entry.contentNodes.filter(
    (node) => node.kind === "example" || node.kind === "idiom",
  );
  const indicator2k = group.indicators.find(
    (indicator) =>
      indicator.indicatorId === "core-vocabulary.nt2-2000" ||
      indicator.messageKey === "indicator.coreVocabulary.nt22000",
  );
  const repeatCount = entry.card?.scheduler.repeatCount ?? 0;

  return (
    <article
      data-testid="sense-card-v2"
      className={`mx-auto flex h-full w-full max-w-[520px] flex-col overflow-y-auto rounded-[20px] border bg-[#1d2028] px-5 py-5 text-slate-100 shadow-[0_18px_45px_rgba(0,0,0,0.18)] transition-[border-color,height] duration-200 motion-reduce:transition-none sm:px-6 ${
        isKnown ? "border-emerald-500/70" : "border-indigo-500/80"
      }`}
    >
      <header>
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-slate-400">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="min-w-0 truncate">
            {t(
              entry.partOfSpeech?.messageKey ??
                group.header.partOfSpeech?.messageKey ??
                "partOfSpeech.zn",
            )}
          </span>
          {indicator2k ? (
            <span className="rounded-md border border-indigo-400/25 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-medium text-indigo-200">
              2K
            </span>
          ) : null}
          <span className="ml-auto shrink-0">
            {t("senseCard.state.meaningCount", { count: group.senseCount })}
          </span>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              {group.header.article ? (
                <span className="shrink-0 font-serif text-[25px] leading-none text-slate-400">
                  {group.header.article}
                </span>
              ) : null}
              <h2 className="min-w-0 break-words font-serif text-[44px] font-normal leading-[0.95] tracking-[-0.025em] text-white">
                {group.header.displayPronunciation ?? group.header.text}
              </h2>
            </div>
            {translationVisible &&
            entry.translation?.status === "ready" &&
            entry.translation.text ? (
              <p className="mt-3 text-sm font-semibold text-[#e5c978]">
                {entry.translation.text}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 gap-2">
            <IconButton
              label={t("senseCard.translation.request")}
              active={translationVisible}
              disabled={busy}
              onClick={onToggleTranslation}
            >
              <LanguageIcon />
            </IconButton>
            {group.header.audio && onPlayAudio ? (
              <IconButton
                label={t("senseCard.audio.play")}
                disabled={busy}
                onClick={onPlayAudio}
              >
                <SpeakerWaveIcon />
              </IconButton>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-5 space-y-5">
        {definitionNodes.length ? (
          <Section title={t("senseCard.sections.meaning")}>
            {definitionNodes.map((node) => (
              <ContentNode
                key={node.contentNodeId}
                text={node.text}
                translation={
                  translationVisible
                    ? node.translations.find(
                        (item) => item.status === "ready" && item.text,
                      )?.text
                    : undefined
                }
              />
            ))}
          </Section>
        ) : null}

        {exampleNodes.length ? (
          <Section
            title={t("senseCard.sections.examples")}
            count={exampleNodes.length}
          >
            {exampleNodes.map((node) => (
              <blockquote
                key={node.contentNodeId}
                className="border-l-[3px] border-indigo-400 pl-3 font-serif text-[17px] italic leading-6 text-slate-100"
              >
                <p>{node.text}</p>
                {translationVisible ? (
                  <TranslatedText
                    text={
                      node.translations.find(
                        (item) => item.status === "ready" && item.text,
                      )?.text
                    }
                  />
                ) : null}
              </blockquote>
            ))}
          </Section>
        ) : null}
      </div>

      <div className="mt-auto pt-5">
        {isKnown && undoKnown ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-semibold text-emerald-200">
              <CheckIcon className="h-4 w-4" />
              {t("senseCard.known.marked")}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(undoKnown)}
              className="flex items-center gap-2 text-indigo-200 transition hover:text-white disabled:opacity-50"
            >
              <ArrowPathIcon className="h-4 w-4" />
              {t(undoKnown.messageKey)}
            </button>
          </div>
        ) : (
          <>
            {learn ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction(learn)}
                className="mx-auto flex h-11 w-[94%] items-center justify-center gap-2 rounded-xl border border-indigo-300/30 bg-indigo-300/30 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-300/40 disabled:opacity-50"
              >
                <LanguageIcon className="h-4 w-4" />
                {t(learn.messageKey)}
              </button>
            ) : null}

            {reviews.length ? (
              <div>
                <SectionTitle title={t("senseCard.sections.reviewPrompt")} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {reviews.map((capability) => (
                    <button
                      key={capability.reviewResult}
                      type="button"
                      disabled={busy}
                      onClick={() => onAction(capability)}
                      className={`relative h-11 overflow-hidden rounded-xl border border-slate-600 bg-transparent px-2 text-xs font-semibold transition before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r-full hover:bg-white/5 disabled:opacity-50 ${reviewTone[capability.reviewResult]}`}
                    >
                      {t(capability.messageKey)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {markKnown ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction(markKnown)}
                className="ml-auto mt-4 flex items-center gap-2 text-xs text-slate-400 transition hover:text-slate-100 disabled:opacity-50"
              >
                <CheckIcon className="h-4 w-4" />
                {t(markKnown.messageKey)}
              </button>
            ) : null}
          </>
        )}

        {!isKnown && repeatCount > 0 ? (
          <span className="sr-only">
            {t("senseCard.state.repeatCount", { count: repeatCount })}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function IconButton({
  label,
  active = false,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full border transition disabled:opacity-50 ${
        active
          ? "border-indigo-300 text-indigo-200"
          : "border-slate-600 text-slate-300 hover:border-slate-400"
      }`}
    >
      <span className="h-5 w-5">{children}</span>
    </button>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <SectionTitle title={title} count={count} />
      <div className="space-y-3 text-[15px] leading-6">{children}</div>
    </section>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h3 className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </h3>
      <span className="h-px flex-1 bg-slate-700/80" />
      {typeof count === "number" ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function ContentNode({
  text,
  translation,
}: {
  text: string;
  translation?: string;
}) {
  return (
    <div>
      <p>{text}</p>
      <TranslatedText text={translation} />
    </div>
  );
}

function TranslatedText({ text }: { text?: string }) {
  return text ? (
    <p className="mt-1 text-[13px] leading-5 text-slate-400">{text}</p>
  ) : null;
}
