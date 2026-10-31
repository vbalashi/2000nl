import type { MutableRefObject } from "react";
import { readCurrentTrainingCard, type CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { fetchNextPlatformV2IdiomTrainingSessionExercise,markPlatformV2IdiomTrainingSessionMemberUnavailable,performPlatformV2IdiomExerciseAction } from "@/lib/platform/platformV2IdiomExerciseClient";
import { fetchNextPlatformV2TranslationTrainingSessionExercise,markPlatformV2TranslationTrainingSessionMemberUnavailable,performPlatformV2TranslationExerciseAction } from "@/lib/platform/platformV2TranslationExerciseClient";
import { loadIdiomExerciseContent } from "@/lib/training/idiomExerciseLoader";
import { resolveIdiomExerciseContent,type IdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import { loadSentenceExerciseContent } from "@/lib/training/sentenceExerciseLoader";
import { resolveSentenceExerciseContent,type SentenceExerciseContent } from "@/lib/training/sentenceExerciseContent";
import type { PlatformIdiomExerciseCandidateV2,PlatformTranslationExerciseCandidateV2 } from "../../../../../packages/shared/types/platformV2";
import type { TrainingExerciseAdapter } from "../useTrainingExerciseSession";
type Input={userId:string;sessionId:string;contentLanguageCode:string;translationTargetLanguageCode:string|null;readPermit:MutableRefObject<{targetId:string;context:CurrentTrainingCardContext}|null>};
export function idiomExerciseAdapter(input:Input):TrainingExerciseAdapter<PlatformIdiomExerciseCandidateV2,IdiomExerciseContent>{
  return {
    timing:{selection:"idiom.session-next",preparation:"idiom.content-lookup"},
    next:()=>fetchNextPlatformV2IdiomTrainingSessionExercise(input.userId,input.sessionId),
    capturePreparation:()=>{
      const permit=input.readPermit.current;
      return async(candidate,signal)=>{
        if(!permit||permit.targetId!==candidate.targetId)return loadIdiomExerciseContent({candidate,contentLanguageCode:input.contentLanguageCode,translationTargetLanguageCode:input.translationTargetLanguageCode,signal});
        const payload=await readCurrentTrainingCard(input.userId,{...permit.context,entryId:candidate.entryId,cardTypeId:"word-to-definition",contentLanguageCode:input.contentLanguageCode,translationTargetLanguageCode:input.translationTargetLanguageCode},signal);
        const group=payload.groups.find(item=>item.entries.some(entry=>entry.kind==="sense-card"&&entry.entryId===candidate.entryId));
        const content=group&&resolveIdiomExerciseContent(candidate,group);
        return content?{state:"ready",content}:{state:"projection-missing"};
      };
    },
    markUnavailable:(targetId,reason)=>markPlatformV2IdiomTrainingSessionMemberUnavailable(input.userId,input.sessionId,targetId,reason),
    act:(candidate,reviewResult,clientEventId)=>performPlatformV2IdiomExerciseAction({trainingSessionId:input.sessionId,candidate,reviewResult,clientEventId}),
  };
}
export function sentenceExerciseAdapter(input:Input & {translationTargetLanguageCode:string}):TrainingExerciseAdapter<PlatformTranslationExerciseCandidateV2,SentenceExerciseContent>{
  return {
    timing:{selection:"next-card.selection",preparation:"next-card.lookup"},
    next:()=>fetchNextPlatformV2TranslationTrainingSessionExercise(input.userId,input.sessionId),
    capturePreparation:()=>{
      const permit=input.readPermit.current;
      return async(candidate,signal,force)=>{
        if(!permit||permit.targetId!==candidate.targetId)return loadSentenceExerciseContent({candidate,contentLanguageCode:input.contentLanguageCode,translationTargetLanguageCode:input.translationTargetLanguageCode,signal,force});
        const payload=await readCurrentTrainingCard(input.userId,{...permit.context,entryId:candidate.entryId,cardTypeId:"word-to-definition",contentLanguageCode:input.contentLanguageCode,translationTargetLanguageCode:input.translationTargetLanguageCode},signal);
        const group=payload.groups.find(item=>item.entries.some(entry=>entry.kind==="sense-card"&&entry.entryId===candidate.entryId));
        const content=group&&resolveSentenceExerciseContent(candidate,group);
        return content?{state:"ready",content}:{state:"projection-missing"};
      };
    },
    markUnavailable:(targetId,reason)=>markPlatformV2TranslationTrainingSessionMemberUnavailable(input.userId,input.sessionId,targetId,reason),
    act:(candidate,reviewResult,clientEventId)=>performPlatformV2TranslationExerciseAction({trainingSessionId:input.sessionId,candidate,reviewResult,clientEventId}),
  };
}
