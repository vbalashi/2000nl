"use client";
import React, {useState} from "react";
import {PersonalCollectionRow,ownedCollectionMenuItems} from "@/components/library/organization/PersonalCollections";
import {OwnedCollectionSharingView} from "@/components/library/sharing/OwnedCollectionSharing";
import {organizationCopy} from "@/components/library/organization/copy";
import {LibraryDestinationTabs} from "@/components/navigation/LibraryDestination";
import {ActionMenu} from "@/components/practice/ui/ActionMenu";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import type {WordListSummary} from "@/lib/types";
import type {CollectionShareManagement} from "@/lib/collections/sharing/shareManagementContract";
import type {PreviewStage} from "./content";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
import organization from "@/components/library/organization/organization.module.css";

export function PreviewCollectionCatalog(p:{language:OnboardingLanguage;collection:WordListSummary;stage:PreviewStage;onStage:(stage:PreviewStage)=>void;onDone:()=>void;onWords:()=>void}) {
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 const [sharing,setSharing]=useState(p.stage.startsWith("sharing-")&&!["sharing-more","sharing-menu"].includes(p.stage));
 const [data,setData]=useState<CollectionShareManagement>({collectionId:p.collection.id,isOpen:false,revision:0,invitationCode:null,subscriberCount:0});
 const t=organizationCopy(p.language);
 const run=async(action:"open"|"rotate"|"close"|"check"|"retry")=>{
  if(action==="open"||action==="rotate") {setData(current=>({...current,isOpen:true,revision:current.revision+1,invitationCode:"00000000000000000000000000"}));p.onStage("sharing-link");}
  if(action==="close") {setData(current=>({...current,isOpen:false,revision:current.revision+1,invitationCode:null}));p.onStage("sharing-done");}
 };
 const controller={state:{key:"onboarding-fixture",status:"ready" as const,data},rejection:null,refresh:async()=>{},run};
 return <div id="preview-collection-catalog" className={workspace.workspace}>
  <LibraryDestinationTabs language={p.language} destination="collections" organizationEnabled sharingEnabled={false} onChange={destination=>{if(destination==="words")p.onWords();}}/>
  <div className={organization.organizer}><section className={organization.catalog} aria-label={t.collections}>
   <header className={organization.catalogHeader}><h2>{t.all}</h2></header>
   <div className={organization.results}><PersonalCollectionRow collection={{...p.collection,ownership:"owned",isShared:data.isOpen}} locale={p.language} onOpen={p.onWords} onMore={event=>{setAnchor(event.currentTarget);p.onStage("sharing-menu");}}/></div>
  </section></div>
  {anchor&&<ActionMenu anchor={anchor} title={t.more} language={p.language} onClose={()=>setAnchor(null)} items={ownedCollectionMenuItems({locale:p.language,sharingEnabled:true,onOpen:p.onWords,onLabels:()=>{},onRename:()=>{},onDelete:()=>{},onShare:()=>{setAnchor(null);setSharing(true);p.onStage("sharing-create");}})}/>}
  <div id="preview-sharing-dialog" onClickCapture={event=>{
   const text=(event.target as Element).closest("button")?.textContent?.trim();
   if(p.stage==="sharing-create"&&text===(p.language==="ru"?"Создать ссылку просмотра":p.language==="nl"?"Alleen-lezenlink maken":"Create view-only link"))requestAnimationFrame(()=>p.onStage("sharing-confirm"));
   if(p.stage==="sharing-link"&&text===(p.language==="ru"?"Закрыть общий доступ":p.language==="nl"?"Gedeelde toegang sluiten":"Close shared access"))requestAnimationFrame(()=>p.onStage("sharing-close-confirm"));
  }}>
   {sharing&&<OwnedCollectionSharingView userId="onboarding-preview" collectionId={p.collection.id} name={p.collection.name} locale={p.language} controller={controller} onClose={()=>{setSharing(false);p.onDone();}}/>}
  </div>
 </div>;
}
