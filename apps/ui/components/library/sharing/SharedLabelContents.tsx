'use client';
import {ActionButton} from '@/components/practice/ui/ActionButton';
import React from 'react';
import {FileText,ExternalLink,FolderOpen} from 'lucide-react';
import {DialogSurface} from '@/components/practice/ui/DialogSurface';
import {SettingsHelp} from '@/components/practice/settings/SettingsHelp';
import {localizedSection} from '@/lib/i18n/catalog';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import {organizationCopy} from '../organization/copy';
import {useLabelShareCollections} from './useLabelShareCollections';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import s from '../organization/organization.module.css';

export function SharedLabelContents({userId,labelId,name,locale,onClose,onOpen,onReference,onOpenLabel}:{userId:string;labelId:string;name:string;locale:OnboardingLanguage;onClose:()=>void;onOpen:(id:string)=>void;onReference?:(code:string)=>void;onOpenLabel?:()=>void}){
 const catalog=useLabelShareCollections(userId,labelId),common=organizationCopy(locale),group=localizedSection('labelSharing')[locale];
 return <DialogSurface className={overlays.dialog} aria-label={group.contents} onDismiss={onClose}>
  <section className={`${s.editor} ${s.groupContents}`}><header><h2>{name}</h2><SettingsHelp label={group.contents} text={group.description}/></header>
   {catalog.status==='loading'?<p role="status">{common.loading}</p>:catalog.status==='error'?<>
    <p role="alert">{localizedSection('invitationPreview')[locale].unavailable}</p><button onClick={catalog.refresh}>{common.retry}</button>
   </>:<>
    {!catalog.page?.collections.length&&!catalog.references.length&&<p>{common.empty}</p>}
    <ul>{catalog.page?.collections.map(collection=><li key={collection.collectionId}><button onClick={()=>onOpen(collection.collectionId)}><FileText size={16} aria-hidden="true"/><span>{collection.name}</span></button></li>)}</ul>
    {catalog.page?.nextCursor&&<button disabled={catalog.loadingMore} onClick={catalog.loadMore}>{catalog.loadingMore?common.loading:common.moreResults}</button>}
    {catalog.references.length>0&&<><h3>{group.originalCollections}</h3><p className={s.muted}>{group.referenceNotice}</p><ul>{catalog.references.map(reference=><li key={reference.collectionId}><button disabled={!onReference} onClick={()=>onReference?.(reference.invitationCode)}><ExternalLink size={16} aria-hidden="true"/><span>{reference.name}</span></button></li>)}</ul></>}
   </>}
   <footer className={s.compactActions}><ActionButton onClick={onClose}>{common.close}</ActionButton>{onOpenLabel&&<ActionButton variant="primary" onClick={onOpenLabel}><FolderOpen size={16} aria-hidden="true"/>{group.openInCollections}</ActionButton>}</footer>
  </section>
 </DialogSurface>;
}
