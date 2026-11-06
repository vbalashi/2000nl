export type FrequencyProfile="spoken"|"written";
export type VocabularyMaterialKind="word"|"other";
export type MeaningLimit=1|2|3|4|5|"all";
export type VocabularySelection={mode:"all"|"frequency";materialKinds:VocabularyMaterialKind[];profile:FrequencyProfile;from:number;to:number;meanings:MeaningLimit};
export type LibraryTrainingSelection={query:string;category:"headwords"|"examples"|"definitions"|"alphabetical";labelId?:string;labelName?:string;languageCode?:string};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
export function validFrequencyRange(from:number,to:number){return Number.isSafeInteger(from)&&Number.isSafeInteger(to)&&from>=1&&to>=from;}
export function parseVocabularySelection(value:unknown):VocabularySelection|null{
 if(!object(value)||Object.keys(value).length!==6||Object.keys(value).some(key=>!["mode","materialKinds","profile","from","to","meanings"].includes(key))||
  typeof value.mode!=="string"||!["all","frequency"].includes(value.mode)||typeof value.profile!=="string"||!["spoken","written"].includes(value.profile)||
  typeof value.from!=="number"||typeof value.to!=="number"||!validFrequencyRange(value.from,value.to)||
  ![1,2,3,4,5,"all"].includes(value.meanings as MeaningLimit)||!Array.isArray(value.materialKinds)||value.materialKinds.length>1||
  value.materialKinds.some(kind=>kind!=="word"&&kind!=="other"))return null;
 return {mode:value.mode as VocabularySelection["mode"],materialKinds:[...value.materialKinds],profile:value.profile as FrequencyProfile,from:value.from,to:value.to,meanings:value.meanings as MeaningLimit};
}
export function parseLibraryTrainingSelection(value:unknown):LibraryTrainingSelection|null{
 if(!object(value)||Object.keys(value).some(key=>!["query","category","labelId","labelName","languageCode"].includes(key))||
  typeof value.query!=="string"||value.query.length>200||typeof value.category!=="string"||!["headwords","examples","definitions","alphabetical"].includes(value.category)||
  (value.languageCode!==undefined&&(typeof value.languageCode!=="string"||value.languageCode.length>35||!/^([a-z]{2,3})(-[a-z0-9]{2,8})*$/.test(value.languageCode)))||
  (value.labelId!==undefined&&(typeof value.labelId!=="string"||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(value.labelId)))||
  (value.labelName!==undefined&&(typeof value.labelName!=="string"||value.labelName.length>200)))return null;
 return {...(value.languageCode?{languageCode:value.languageCode as string}:{}),query:value.query.trim(),category:value.category as LibraryTrainingSelection["category"],...(value.labelId?{labelId:value.labelId as string}:{}),...(value.labelName?{labelName:value.labelName as string}:{})};
}
export const DEFAULT_VOCABULARY_SELECTION:VocabularySelection={mode:"all",materialKinds:[],profile:"spoken",from:1,to:100,meanings:"all"};
export const vocabularySelectionActive=(value?:VocabularySelection)=>Boolean(value&&(value.mode==="frequency"||value.meanings!=="all"||value.materialKinds.length));

/** Display names never affect selection or run identity. */
export function libraryTrainingCriteria(value?:LibraryTrainingSelection){return value?{query:value.query,category:value.category,...(value.languageCode?{languageCode:value.languageCode}:{}),...(value.labelId?{labelId:value.labelId}:{})}:undefined;}
