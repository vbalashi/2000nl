import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";

export type EmptyTrainingCounts = { dueToday: number | null; totalReviews: number | null; stillNew: number | null };
/** Display-only guidance. Unknown counts never prove an empty selection. */
export function trainingEmptyState(language: OnboardingLanguage, filter: "new" | "review" | "both" | undefined, counts: EmptyTrainingCounts) {
  const copy = getUiMessages(language).trainingOverview;
  const { dueToday, totalReviews, stillNew } = counts;
  if (filter === "new") return stillNew === 0 ? { message: copy.noNewCards, includeNew: false } : null;
  if (dueToday !== 0 || (filter === "both" && stillNew !== 0)) return null;
  if (filter === "review" && stillNew !== null && stillNew > 0) return {
    message: copy.reviewsOnlyNew, includeNew: true,
  };
  if (totalReviews === null || stillNew === null) return null;
  return { message: totalReviews > 0 ? copy.nothingDue : copy.noMatchingCards, includeNew: false };
}
