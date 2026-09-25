"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { PlatformTrainingExerciseStatsV1 } from "../../../../packages/shared/types/platformV2";
import sessionStyles from "./v2/TrainingSessionLayout.module.css";

export const trainingFooterCopy = {
  nl: { new: "Nieuw", review: "Herhaling", total: "Totaal" },
  en: { new: "New", review: "Review", total: "Total" },
  ru: { new: "Новые", review: "Повторение", total: "Всего" },
} satisfies Record<
  OnboardingLanguage,
  { new: string; review: string; total: string }
>;

function CompactProgressStat({
  label,
  value,
  total,
  unknownLabel,
  barColorClass,
}: {
  label: string;
  value: number | null;
  total?: number | null;
  unknownLabel: string;
  barColorClass: string;
}) {
  const progress =
    value !== null && total && total > 0
      ? Math.min((value / total) * 100, 100)
      : 0;
  return (
    <div className={sessionStyles.stat}>
      <span className={sessionStyles.statLabel} title={label}>
        {label}
      </span>
      {total != null && (
        <div className={sessionStyles.statBar} aria-hidden="true">
          <div
            className={`h-full rounded-sm transition-[width] motion-reduce:transition-none ${barColorClass}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <span
        className={sessionStyles.statValue}
        aria-label={value === null ? `${label}: ${unknownLabel}` : undefined}
      >
        {value === null ? "—" : value}
        {total != null && `/${total}`}
      </span>
    </div>
  );
}


/** Shared presentation; each scenario supplies counts from its own read model. */
export function TrainingSessionStatsFooter({
  stats, status, interfaceLanguage, initialReviewDue,
}: {
  stats: Omit<PlatformTrainingExerciseStatsV1, "contractVersion"> | null;
  status: "pending" | "ready" | "error";
  interfaceLanguage: OnboardingLanguage;
  initialReviewDue?: number | null;
}) {
  const text = trainingFooterCopy[interfaceLanguage];
  const ready = status === "ready" && stats !== null;
  const unknownLabel = status === "pending"
    ? { en: "loading", nl: "wordt geladen", ru: "загружается" }[interfaceLanguage]
    : { en: "unavailable", nl: "niet beschikbaar", ru: "недоступно" }[interfaceLanguage];
  return (
    <footer data-compact="true" data-visual-spec="training-height-b"
      className={`${sessionStyles.footer} font-sense-sans`}>
      <div data-testid="training-session-footer-progress" className={sessionStyles.stats}>
        <CompactProgressStat label={text.new} value={ready ? stats.newCardsToday : null}
          unknownLabel={unknownLabel} barColorClass="bg-blue-400" />
        <CompactProgressStat label={text.review} value={ready ? stats.reviewCardsDone : null}
          total={ready ? initialReviewDue ?? stats.reviewCardsDone + stats.reviewCardsDue : null}
          unknownLabel={unknownLabel} barColorClass="bg-amber-400" />
        <CompactProgressStat label={text.total} value={ready ? stats.totalCardsStarted : null}
          total={ready ? stats.totalCardsInScope : null}
          unknownLabel={unknownLabel} barColorClass="bg-emerald-400" />
      </div>
    </footer>
  );
}
