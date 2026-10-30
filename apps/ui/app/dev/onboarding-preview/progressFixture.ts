import type { ComponentProps } from "react";
import type { MeaningLearningProgress } from "@/components/practice/MeaningLearningProgress";
export function previewMeaningProgress(entryId: string, learned: boolean): NonNullable<ComponentProps<typeof MeaningLearningProgress>["initialProgress"]> {
 return {entryId,headword:"de bank",exclusionId:null,revision:"0".repeat(64),directions:(["word-to-definition","definition-to-word"] as const).map((cardTypeId,index)=>({
  cardTypeId,stateRevision:"preview-progress",knownMarkId:null,knownMarkRevision:null,knownMarkedAt:null,
  phase:learned&&index===0?"learning":"new",presentations:learned&&index===0?1:0,gradedAttempts:0,
  lastGrade:null,lastReviewedAt:null,nextReviewAt:null,stability:null,difficulty:null,
 }))};
}
