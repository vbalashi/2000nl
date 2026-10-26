import React from 'react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';

export type CollectionSourceRead={collectionId:string;type:'user';status:'loading'|'ready'|'error'|'unavailable';onRetry:()=>void};
const copy={
 en:{loading:'Loading collection…',ready:'',error:'Could not load collection details.',unavailable:'This collection is no longer available.',retry:'Retry'},
 ru:{loading:'Загрузка коллекции…',ready:'',error:'Не удалось загрузить сведения о коллекции.',unavailable:'Эта коллекция больше недоступна.',retry:'Повторить'},
 nl:{loading:'Collectie laden…',ready:'',error:'Collectiegegevens konden niet worden geladen.',unavailable:'Deze collectie is niet meer beschikbaar.',retry:'Opnieuw proberen'},
};
export const collectionSourceMessage=(locale:OnboardingLanguage,status:CollectionSourceRead['status'])=>copy[locale][status];
export function SelectedCollectionSourceStatus({read,locale}:{read:CollectionSourceRead;locale:OnboardingLanguage}){
 if(read.status!=='error'&&read.status!=='unavailable')return null;
 return <p role={read.status==='error'?'alert':'status'}>{collectionSourceMessage(locale,read.status)}{' '}<button type="button" onClick={read.onRetry}>{copy[locale].retry}</button></p>;
}
