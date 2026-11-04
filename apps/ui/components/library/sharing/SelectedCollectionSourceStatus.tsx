import { localizedSection } from "@/lib/i18n/catalog";
import React from 'react';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';

export type CollectionSourceRead={collectionId:string;type:'user';status:'loading'|'ready'|'error'|'unavailable';onRetry:()=>void};
const copy=localizedSection("collectionSourceStatus");
export const collectionSourceMessage=(locale:OnboardingLanguage,status:CollectionSourceRead['status'])=>copy[locale][status];
export function SelectedCollectionSourceStatus({read,locale}:{read:CollectionSourceRead;locale:OnboardingLanguage}){
 if(read.status!=='error'&&read.status!=='unavailable')return null;
 return <p role={read.status==='error'?'alert':'status'}>{collectionSourceMessage(locale,read.status)}{' '}<button type="button" onClick={read.onRetry}>{copy[locale].retry}</button></p>;
}
