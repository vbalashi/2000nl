import {firstExactRenderableNodeTranslationV1} from "../../../../../packages/shared/platform-v2/displayedTranslationArtifactIdentityV1";
import type {PlatformWordDetailsV2} from '../../../../../packages/shared/types/platformV2';
import type {WordFormDetail} from './ArticleWordDetails';

const formLabels: Record<string,string> = {
 plural:'Plural', diminutive:'Diminutive', verbForms:'Principal forms',
 inflectedForm:'Inflected form', comparative:'Comparative', superlative:'Superlative',
 derivation:'Derivation', alternateHeadword:'Alternate headword',
};

/** Adapt public semantic forms only; dictionary raw parsing stays server-side. */
export function wordFormDetail(details:PlatformWordDetailsV2|undefined, pos:string):WordFormDetail|null {
 if(!details?.forms.length)return null;
 const forms:WordFormDetail['forms']=[];
 const conjugation:WordFormDetail['conjugation']={};
 for(const form of details.forms){
  const kind=form.kind.sourceValue??form.kind.termId.split('.').at(-1)??'';
  if(kind==='conjugation'){
   const feature=(name:string)=>form.features.find(f=>f.termId.includes(`.${name}.`))?.sourceValue;
   const tense=feature('tense');const person=feature('personOrForm');
   if(tense&&person&&['present','past','perfect'].includes(tense))(conjugation[tense]??={})[person]=form.text;
   else forms.push({label:'Form',value:form.text});
  }else forms.push({label:formLabels[kind]??'Form',value:form.text});
 }
 const principal=forms.filter(f=>f.label==='Principal forms');
 if(principal.length>1){forms.splice(0,forms.length,...forms.filter(f=>f.label!=='Principal forms'),{label:'Principal forms',value:[...new Set(principal.map(f=>f.value))].join(', ')});}
 const canonicalPos=({noun:'zn',verb:'ww',adjective:'bn',adverb:'bw',numeral:'tw'} as Record<string,string>)[pos]??pos;
 const presentationPos=canonicalPos.trim()|| (Object.keys(conjugation).length||principal.length?'ww':forms.some(f=>['Plural','Diminutive'].includes(f.label))?'zn':forms.some(f=>['Comparative','Superlative','Inflected form'].includes(f.label))?'bn':'');
 return {forms:forms.filter((form,i)=>forms.findIndex(f=>f.label===form.label&&f.value===form.value)===i),conjugation,pos:presentationPos};
}

export type LexicalRelationDisplayItem = {relationId:string;text:string;translation?:string};
export function lexicalRelationDetail(details?:PlatformWordDetailsV2,targetLanguageCode?:string){
 const values=(kind:"synonym"|"antonym"):LexicalRelationDisplayItem[]=>details?.lexicalRelations.filter(r=>r.kind===kind).map(r=>{
  const translation=r.sourceTextFingerprint&&targetLanguageCode ? firstExactRenderableNodeTranslationV1((r.translations??[]).filter(t=>t.targetLanguageCode===targetLanguageCode),r.sourceTextFingerprint)?.text : undefined;
  return {relationId:r.relationId,text:r.text,...(translation?{translation}:{})};
 })??[];
 return {synonyms:values("synonym"),antonyms:values("antonym")};
}

/** Headword-level display is safe only when every sense supplies identical forms. */
export function commonWordForms(details:Array<PlatformWordDetailsV2|undefined>,pos:string):WordFormDetail|null{
 const normalized=details.map(d=>wordFormDetail(d,pos));
 const signature=(d:WordFormDetail|null)=>d?JSON.stringify({forms:[...d.forms].sort((a,b)=>a.label.localeCompare(b.label)||a.value.localeCompare(b.value)),conjugation:Object.fromEntries(Object.entries(d.conjugation).sort().map(([tense,persons])=>[tense,Object.fromEntries(Object.entries(persons).sort())]))}):null;
 return normalized.length&&normalized[0]&&normalized.every(d=>signature(d)===signature(normalized[0]))?normalized[0]:null;
}
