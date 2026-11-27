export type AssistantFeedbackVote = "up" | "down";
export type AssistantFeedbackJourney = "search" | "draft";

export const assistantFeedbackReasons = {
  search: ["wrongMeaning", "unrelated", "notFound"],
  draft: ["wrongMeaning", "unrelated", "example", "save"],
} as const;

export type AssistantFeedbackReason = typeof assistantFeedbackReasons[AssistantFeedbackJourney][number];
