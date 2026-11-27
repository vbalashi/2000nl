export type AssistantFeedbackVote = "up" | "down";
export type AssistantFeedbackJourney = "search" | "draft";

export const assistantFeedbackReasons = {
  search: ["wrongMeaning", "unrelated", "notFound"],
  draft: ["wrongMeaning", "unrelated", "example", "save"],
} as const;

export type AssistantFeedbackReason = typeof assistantFeedbackReasons[AssistantFeedbackJourney][number];

export const assistantFeedbackHistoryLimit = 8;
export const assistantFeedbackQuestionLimit = 1500;
export const assistantFeedbackAnswerLimit = 6000;

export type AssistantFeedbackExchange = { question: string; answer: string };
