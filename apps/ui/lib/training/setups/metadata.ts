import { localizedSection } from "@/lib/i18n/catalog";
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {formatUiCount,formatUiMessage,getUiMessages} from '@/lib/uiMessages';
import type {TrainingSetupDraft} from './types';
import {partId} from '@/lib/vocabulary/partsOfSpeech';
import {singleNounArticle} from '@/lib/training/nounArticles';

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
 const mixLabel=draft.cardFilter==='both'?formatUiCount(language,draft.newReviewRatio,getUiMessages(language).builder,'ratio'):selection;
 const size=draft.sessionSize??10;
 const count=size==='all-due-today'?copy.allDue:formatUiMessage(copy.sessionLimit,{count:size});
 const vocabulary=draft.vocabulary;
 const parts=localizedSection('vocabularyPartShort')[language];
 const material=localizedSection('materialKinds')[language];
 const vcopy=localizedSection('vocabularySelection')[language];
 const kind=vocabulary?.materialKinds[0];
 const selectedParts=kind==='other'?[]:(draft.partOfSpeech??[]).map(part=>{const id=partId(part);return id?parts[id]:part;});
 const article=kind==='other'?null:singleNounArticle(draft.nounArticles??[]);
 const range=vocabulary?.mode==='frequency'?[vocabulary.profile==='spoken'?vcopy.spokenShort:vcopy.writtenShort, vocabulary.from===1?formatUiMessage(vcopy.top,{count:vocabulary.to.toLocaleString(language)}):`${vocabulary.from.toLocaleString(language)}–${vocabulary.to.toLocaleString(language)}`].join(' '):null;
 const meanings=vocabulary&&vocabulary.meanings!=='all'?formatUiMessage(copy.meaningLimitCompact,{count:vocabulary.meanings}):null;
 const kindLabel=kind==='word'&&selectedParts.length>0?null:kind?material[kind]:null;
 const description=[exercise,direction,kindLabel,...selectedParts,article,range,meanings,selection,count].filter(Boolean).join(' · ');
 const fullMeanings=vocabulary&&vocabulary.meanings!=="all"?(vocabulary.meanings===1?vcopy.firstMeaning:formatUiCount(language,vocabulary.meanings,vcopy,"firstMeanings")):null;
 const accessibleCount=typeof size==='number'?formatUiMessage(copy.sessionLimitAccessible,{count:size}):count;
 const accessibleDescription=[exercise,direction,kindLabel,...selectedParts,article,range,fullMeanings,mixLabel,accessibleCount].filter(Boolean).join(' · ');
 return {description,summary:[languageLabel,description].join(' · '),accessibleDescription,accessibleSummary:[languageLabel,accessibleDescription].join(' · '),directionLabel:direction??undefined,directionModes:direction?draft.modes:undefined,frequencyProfile:range?vocabulary?.profile:undefined,frequencyLabel:range?(vocabulary?.profile==='spoken'?vcopy.spokenShort:vcopy.writtenShort):undefined,meaningLabel:meanings??undefined,meaningLimit:meanings?vocabulary?.meanings:undefined,sessionLimitLabel:typeof size==='number'?count:undefined,sessionLimitValue:typeof size==='number'?size:undefined,mixSelectionLabel:selection,mixAccessibleLabel:mixLabel,mixFilter:draft.cardFilter,mixRatio:draft.newReviewRatio};
}
