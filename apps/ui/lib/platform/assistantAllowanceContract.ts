export type AssistantAllowanceKind = "ai_reply" | "dictation";

export type AssistantAllowances = {
  premium: boolean;
  manualUntil: string | null;
  aiRepliesRemaining: number;
  dictationsRemaining: number;
  personalMeaningsRemaining: number;
};

export const allowanceOperationHeader = "X-Dilum-Operation-Id";

export function readAssistantAllowances(value: unknown): AssistantAllowances | null {
  if (!value || typeof value !== "object") return null;
  const { premium, manualUntil, aiRepliesRemaining, dictationsRemaining, personalMeaningsRemaining } = value as Partial<AssistantAllowances>;
  if (typeof premium !== "boolean" || !(manualUntil === null || (
    typeof manualUntil === "string" && Number.isFinite(Date.parse(manualUntil))
  )) || typeof aiRepliesRemaining !== "number" || !Number.isSafeInteger(aiRepliesRemaining) || aiRepliesRemaining < 0
    || typeof dictationsRemaining !== "number" || !Number.isSafeInteger(dictationsRemaining) || dictationsRemaining < 0
    || typeof personalMeaningsRemaining !== "number" || !Number.isSafeInteger(personalMeaningsRemaining) || personalMeaningsRemaining < 0) return null;
  return { premium, manualUntil, aiRepliesRemaining, dictationsRemaining, personalMeaningsRemaining };
}
