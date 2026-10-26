"use client";
import { useActiveStudyTime } from "./useActiveStudyTime";
import { deliverStudyTime } from "@/lib/training/studyTime/delivery";
export function useRecordedStudyTime(input: {
  ownerId: string; sessionId: string | null | undefined; family: "meaning" | "idiom" | "sentence";
  entryId: string | null | undefined; cardTypeId?: string; targetId?: string; enabled: boolean;
}): void {
  const target = { entryId: input.entryId ?? "", cardTypeId: input.cardTypeId ?? null, targetId: input.targetId ?? null };
  useActiveStudyTime({
    identity: input.sessionId && input.entryId ? { ownerId: input.ownerId,sessionId: input.sessionId,family: input.family,
      cardKey: JSON.stringify(target),target } : null,
    enabled: input.enabled,
    onDuration: deliverStudyTime,
  });
}
