import React from "react";
import {Clock3} from "lucide-react";
import s from "./libraryLearningSummary.module.css";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {platformV2Message} from "@/lib/platform/platformV2ClientI18n";
import type {LibrarySenseCardModel} from "./librarySenseCardModel";

/** Read-only summary of this exact directional card, never sibling progress. */
export function LibraryLearningSummary({meaning, language}: {meaning: LibrarySenseCardModel; language: OnboardingLanguage}) {
  if (!["learning", "reviewing", "hidden", "frozen"].includes(meaning.schedulerPhase ?? "")) return null;
  const t = (key: string) => platformV2Message(language, `senseCard.state.${key}`);
  const gradeKeys = {1: "fail", 2: "hard", 3: "success", 4: "easy"} as const;
  const grade = meaning.lastGrade ? platformV2Message(language, `senseCard.review.${gradeKeys[meaning.lastGrade]}`)
    : meaning.reviewCount === 0 ? t("ungraded") : t("unavailable");
  const timestamp = meaning.nextDueAt ? Date.parse(meaning.nextDueAt) : NaN;
  const scheduled = meaning.schedulerPhase === "learning" || meaning.schedulerPhase === "reviewing";
  return <div className={s.summary}><Clock3 size={13} aria-hidden="true"/><dl data-testid="library-learning-summary" className={s.details}>
    <div><dt className="inline">{t("lastGrade")}: </dt><dd className="inline">{grade}</dd></div>
    <div><dt className="inline">{t("reviewCount")}: </dt><dd className="inline">{meaning.reviewCount ?? "—"}</dd></div>
    <div><dt className="inline">{t("nextReview")}: </dt><dd className="inline">{!scheduled ? t(meaning.schedulerPhase!) : Number.isFinite(timestamp)
      ? <time dateTime={meaning.nextDueAt!}>{new Intl.DateTimeFormat(language, {dateStyle:"medium", timeStyle:"short"}).format(timestamp)}</time>
      : t("unavailable")}</dd></div>
  </dl></div>;
}
