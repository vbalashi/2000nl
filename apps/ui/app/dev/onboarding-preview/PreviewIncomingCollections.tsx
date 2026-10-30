"use client";
import React,{useState} from "react";
import {LibraryDestinationTabs} from "@/components/navigation/LibraryDestination";
import {SharedCollectionsWorkspaceView} from "@/components/library/sharing/SharedCollectionsWorkspace";
import {ReceivedCollections} from "@/components/library/sharing/ReceivedCollections";
import {OwnedSharedCollections} from "@/components/library/sharing/OwnedSharedCollections";
import {InvitationInput} from "@/components/library/sharing/InvitationInput";
import {InvitationPreviewView} from "@/components/library/sharing/InvitationPreview";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import type {PreviewStage} from "./content";
import {incomingCode,incomingId,incomingPreview,incomingRow} from "./incomingFixture";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
export function PreviewIncomingCollections(p:{language:OnboardingLanguage;stage:PreviewStage;added:boolean;sourceName?:string;onAccept:()=>boolean;onStage:(stage:PreviewStage)=>void;onWords:()=>void;onCollections:()=>void}) {
 const [failed,setFailed]=useState(false);
 const view=p.stage==="incoming-received"?"owned":"received";
 const noop=async()=>{};
 const row=incomingRow(p.language,p.sourceName);
 const accept=async()=>{if(p.onAccept()){setFailed(false);p.onStage("incoming-accepted");}else setFailed(true);};
 const state=p.stage==="incoming-accepted"?{status:"accepted" as const,key:incomingCode,collectionId:incomingId,available:true,name:row.name,entryCount:2}
  :{status:failed?"storage-error" as const:"ready" as const,key:incomingCode,preview:{...incomingPreview(p.language,row.name),alreadyAdded:p.added}};
 const receivedCatalog={status:"ready" as const,collections:p.added?[row]:[],revision:p.added?1:0,nextCursor:null,loadingMore:false,refresh:noop,loadMore:noop};
 const ownedCatalog={status:"ready" as const,collections:[],nextCursor:null,loadingMore:false,refresh:noop,loadMore:noop};
 return <div id="preview-incoming" className={workspace.workspace}>
  <LibraryDestinationTabs language={p.language} destination="shared" organizationEnabled sharingEnabled onChange={destination=>{if(destination==="words")p.onWords();if(destination==="collections")p.onCollections();}}/>
  {p.stage==="incoming-input"?<InvitationInput locale={p.language} initialValue={incomingCode} readOnly onCancel={()=>p.onStage("incoming-add")} onSubmit={()=>p.onStage("incoming-preview")}/>
   :p.stage==="incoming-preview"||p.stage==="incoming-accepted"?<InvitationPreviewView userId="onboarding-preview" code={incomingCode} locale={p.language} controller={{state,accept,reconcile:noop,retry:accept,refresh:noop}} onClose={()=>p.onStage("incoming-list")} onOpen={()=>p.onStage("incoming-words")}/>
   :<SharedCollectionsWorkspaceView userId="onboarding-preview" active locale={p.language} view={view} onViewChange={value=>p.onStage(value==="received"?"incoming-add":"incoming-received")} onOpenOwned={()=>{}} onOpenReceived={()=>p.onStage("incoming-words")} onAdd={()=>p.onStage("incoming-input")} counts={{sharedByMe:0,addedByMe:p.added?1:0}}
     owned={<OwnedSharedCollections userId="onboarding-preview" active locale={p.language} catalogOverride={ownedCatalog} onOpen={()=>{}} onChanged={()=>{}}/>}
     received={<ReceivedCollections userId="onboarding-preview" active locale={p.language} embedded catalogOverride={receivedCatalog} onOpen={()=>p.onStage("incoming-words")} onAdd={()=>p.onStage("incoming-input")}/>}/>}
 </div>;
}
