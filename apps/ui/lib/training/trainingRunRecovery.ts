import type { PlatformIdiomExerciseSessionV2,PlatformTranslationExerciseSessionV2 } from "../../../../packages/shared/types/platformV2";
import { fetchPlatformV2IdiomTrainingSessionSnapshot } from "@/lib/platform/platformV2IdiomExerciseClient";
import { fetchPlatformV2TranslationTrainingSessionSnapshot } from "@/lib/platform/platformV2TranslationExerciseClient";
import { fetchTrainingSessionSnapshot,type TrainingSessionSnapshot } from "@/lib/trainingService";
import type { TrainingSessionResumeRecord } from "./sessionResumeStore";
import type { TrainingOperation } from "./trainingOperationScope";
import { classifyResumeSnapshot } from "./sessionLifecycle";
type RestoredRun = {family:"idiom";snapshot:PlatformIdiomExerciseSessionV2}
 | {family:"sentence";snapshot:PlatformTranslationExerciseSessionV2}
 | {family:"meaning"|"word-in-context";snapshot:TrainingSessionSnapshot};
/** One recovery verdict for every family; reads never start or grade a run. */
export async function recoverTrainingRun(userId:string,record:TrainingSessionResumeRecord,operation:TrainingOperation):Promise<
  RestoredRun & {kind:"resumable"} | {kind:"cancelled"|"missing"|"superseded"|"no-remaining-member"}
>{
  const family=record.family??"meaning";
  const snapshot=family==="idiom" ? await fetchPlatformV2IdiomTrainingSessionSnapshot(userId,record.sessionId)
    : family==="sentence" ? await fetchPlatformV2TranslationTrainingSessionSnapshot(userId,record.sessionId)
    : await fetchTrainingSessionSnapshot(userId,record.sessionId);
  if(!operation.isCurrent())return {kind:"cancelled"};
  const verdict=classifyResumeSnapshot(snapshot);
  if(verdict.kind!=="resumable"||!snapshot)return verdict.kind==="resumable"?{kind:"missing"}:verdict;
  // The family selects the corresponding validated transport parser above.
  return {kind:"resumable",family,snapshot} as RestoredRun & {kind:"resumable"};
}
