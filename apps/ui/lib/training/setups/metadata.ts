import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {formatExerciseCount,getUiMessages} from '@/lib/uiMessages';
import type {TrainingSetupDraft} from './types';

/** Presentation capabilities, separate from scheduler filters and saved data. */
const exercisePresentation = {
 meaning: {label:'Words',direction:true},
 idiom: {label:'Idioms',direction:true},
 'word-in-context': {label:'Translation',direction:false},
 sentence: {label:'Translation',direction:false},
} as const;
const selectionLabels = {
 en:{new:'New only',review:'Reviews only',both:'New + reviews'},
 nl:{new:'Alleen nieuwe',review:'Alleen herhalingen',both:'Nieuw + herhalingen'},
 ru:{new:'Только новые',review:'Только повторения',both:'Новые + повторения'},
};
export function trainingMetadata(draft:TrainingSetupDraft,language:OnboardingLanguage,languageLabel:string){
 const copy=getUiMessages(language).trainingOverview;
 const capability=exercisePresentation[draft.family??'meaning'];
 const exercise=draft.family==='sentence'?copy.pausedSentenceLabel:copy.exerciseType[capability.label];
 const direction=capability.direction?draft.modes.map(mode=>mode==='word-to-definition'?copy.direction.Direct:mode==='definition-to-word'?copy.direction.Reverse:null).filter(Boolean).join(' + '):null;
 const selection=selectionLabels[language][draft.cardFilter];
 const size=draft.sessionSize??10;
 const count=size==='all-due-today'?copy.allDue:formatExerciseCount(language,size);
 const description=[exercise,direction,selection].filter(Boolean).join(' · ');
 return {description,summary:[languageLabel,description,count].join(' · ')};
}
