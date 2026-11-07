'use client';
import React from 'react';
import {FileText} from 'lucide-react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {localizedSection} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {organizationCopy} from '../organization/copy';
import {useLabelShareCollections} from './useLabelShareCollections';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';

export function SharedLabelContents({userId,labelId,name,locale,onClose,onOpen}:{userId:string;labelId:string;name:string;locale:OnboardingLanguage;onClose:()=>void;onOpen:(id:string)=>void}){
 const catalog=useLabelShareCollections(userId,labelId),common=organizationCopy(locale),group=localizedSection('labelSharing')[locale];
 return <DialogSurface className={overlays.dialog} aria-label={group.contents} onDismiss={onClose}>
  <section className={`${s.editor} ${s.groupContents}`}><h2>{name}</h2><p>{group.description}</p>
   {catalog.status==='loading'?<p role="status">{common.loading}</p>:catalog.status==='error'?<>
    <p role="alert">{localizedSection('invitationPreview')[locale].unavailable}</p><button onClick={catalog.refresh}>{common.retry}</button>
   </>:<>
    {!catalog.page?.collections.length&&<p>{common.empty}</p>}
    <ul>{catalog.page?.collections.map(collection=><li key={collection.collectionId}><button onClick={()=>onOpen(collection.collectionId)}><FileText size={16} aria-hidden="true"/><span>{collection.name}</span></button></li>)}</ul>
    {catalog.page?.nextCursor&&<button disabled={catalog.loadingMore} onClick={catalog.loadMore}>{catalog.loadingMore?common.loading:common.moreResults}</button>}
   </>}
   <footer><button onClick={onClose}>{common.close}</button></footer>
  </section>
 </DialogSurface>;
}
