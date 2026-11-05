import { localizedSection } from "@/lib/i18n/catalog";
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {formatUiMessage,getUiMessages} from '@/lib/uiMessages';
import type {TrainingSetupDraft} from './types';

/** Presentation capabilities, separate from scheduler filters and saved data. */
const exercisePresentation = {
 meaning: {labelKey:'Words',direction:true},
 idiom: {labelKey:'Idioms',direction:true},
 'word-in-context': {labelKey:'Translation',direction:false},
 sentence: {labelKey:'Translation',direction:false},
} as const;
const selectionLabels = localizedSection("trainingFilter");
export function trainingMetadata(draft:TrainingSetupDraft,language:OnboardingLanguage,languageLabel:string){
 const copy=getUiMessages(language).trainingOverview;
 const capability=exercisePresentation[draft.family??'meaning'];
 const exercise=draft.family==='sentence'?copy.pausedSentenceLabel:copy.exerciseType[capability.labelKey];
 const direction=capability.direction?draft.modes.map(mode=>mode==='word-to-definition'?copy.direction.Direct:mode==='definition-to-word'?copy.direction.Reverse:null).filter(Boolean).join(' + '):null;
 const selection=selectionLabels[language][draft.cardFilter];
 const size=draft.sessionSize??10;
 const count=size==='all-due-today'?copy.allDue:formatUiMessage(copy.sessionLimit,{count:size});
 const description=[exercise,direction,selection,count].filter(Boolean).join(' · ');
 return {description,summary:[languageLabel,description].join(' · ')};
}
