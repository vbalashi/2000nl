import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {getUiMessages} from "@/lib/uiMessages";
import {previewLanguageName} from "./previewLanguage";

/** Presentation only: history keeps canonical exercise IDs and dictionary words. */
export function sessionExerciseLabel(locale:OnboardingLanguage,kind:string):string {
 const copy=getUiMessages(locale).trainingOverview;
 const labels:Record<string,string>={};
 for(const type of ["Words","Idioms"] as const)for(const direction of ["Direct","Reverse"] as const){
  labels[`${type} · ${direction}`]=`${copy.exerciseType[type]} · ${copy.direction[direction]}`;
 }
 labels["Translation · English → Dutch"]=`${copy.exerciseType.Translation} · ${previewLanguageName(locale,"English")} → ${previewLanguageName(locale,"Dutch")}`;
 return labels[kind]??kind;
}
