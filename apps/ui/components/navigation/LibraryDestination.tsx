"use client";
import { dictionarySourceProfile } from "@/lib/dictionary/sourceProfile";
import {CollectionSelectionContext} from "@/components/library/sharing/CollectionSelectionContext";

import React, { useEffect, useMemo, useState } from "react";
import { Folders, List, Share2 } from "lucide-react";
import {SharedCollectionsWorkspace} from '@/components/library/sharing/SharedCollectionsWorkspace';
import {useReceivedSource} from '@/components/library/sharing/useReceivedSource';
import {InvitationInput} from '@/components/library/sharing/InvitationInput';
import {InvitationPreview} from '@/components/library/sharing/InvitationPreview';
import {forgetShareInvitation} from '@/lib/collections/sharing/shareInvitationIntake';
import { PersonalCollections } from "@/components/library/organization/PersonalCollections";
import { organizationCopy } from "@/components/library/organization/copy";
import organization from "@/components/library/organization/organization.module.css";
import { getUiMessages } from "@/lib/uiMessages";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
import {
  createDictionarySearchTabState,
  DictionarySearchTab,
  type DictionarySearchTabState,
} from "@/components/training/wordlist/DictionarySearchTab";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  EntryLearningListMembership,
  WordListSummary,
} from "@/lib/types";

export type LibraryMeaningIntent = {ownerId:string;key:string;entryId:string;headword:string;contentLanguageCode:string};

type Props = {
  onboardingSearch?:{key:string;query:string}|null;
  invitationCode?: string | null;
  onInvitationConsumed?:()=>void;
  meaningIntent?: LibraryMeaningIntent | null;
  open: boolean;
  userId: string;
  language: string;
  translationLang: string | null;
  interfaceLanguage: OnboardingLanguage;
  lists: WordListSummary[];
  activeList: WordListSummary | null;
  onReloadLists: () => Promise<void>;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
  onTrainWord?: (wordId: string) => void;
};

export function LibraryDestination(props: Props) {
  return <LibraryDestinationSession key={props.userId} {...props} />;
}

function LibraryDestinationSession({
  open,
  invitationCode,
  onInvitationConsumed,
  userId,
  language,
  translationLang,
  interfaceLanguage,
  lists,
  activeList,
  onReloadLists,
  onOpenListMembership,
  onTrainWord,
  meaningIntent,
  onboardingSearch,
}: Props) {
  const [searchState, setSearchState] = useState<DictionarySearchTabState>(() =>
    createDictionarySearchTabState(),
  );
  const organizationEnabled = process.env.NEXT_PUBLIC_COLLECTION_ORGANIZATION_ENABLED === "true";
  const sharingEnabled=process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true';
  const [pendingCode,setPendingCode]=useState(sharingEnabled?invitationCode??null:null);
  const [destination, setDestination] = useState<"words" | "collections" | "shared">(pendingCode?'shared':'words');
  const lastInvitation=React.useRef<string|null>(pendingCode);
  useEffect(()=>{if(sharingEnabled&&invitationCode&&lastInvitation.current!==invitationCode){lastInvitation.current=invitationCode;setPendingCode(invitationCode);setDestination('shared');}},[sharingEnabled,invitationCode]);
  const [inputOpen,setInputOpen]=useState(false);
  const [sharedView,setSharedView]=useState<'owned'|'received'>('owned');
  const [pickedOwn,setPickedOwn]=useState<{userId:string;row:WordListSummary;pending:boolean;error:boolean;fresh:boolean}|null>(null);
  const [receivedSourceId,setReceivedSourceId]=useState<string|null>(null);
  const selectedReceivedId=sharingEnabled&&searchState.applyListFilter&&searchState.collectionId&&(searchState.collectionId===receivedSourceId||lists.some(list=>list.id===searchState.collectionId&&list.ownership==='received'))?searchState.collectionId:null;
  useEffect(()=>{if(selectedReceivedId)setReceivedSourceId(selectedReceivedId);},[selectedReceivedId]);
  const receivedRead=useReceivedSource(userId,selectedReceivedId,sharingEnabled&&open&&destination==='words');
  const receivedSource:WordListSummary|null=receivedRead.source?{id:receivedRead.source.id,name:receivedRead.source.name,type:'user',ownership:'received',created_at:receivedRead.source.createdAt}:null;
  const closeInvitation=()=>{onInvitationConsumed?.();try{forgetShareInvitation(window.sessionStorage);}catch{}setPendingCode(null);setInputOpen(false);setSharedView('received');setDestination('shared');};
  const copy = organizationCopy(interfaceLanguage);
  const lastIntent = React.useRef<string>();
  useEffect(()=>{
    if(!meaningIntent || meaningIntent.ownerId!==userId || lastIntent.current===meaningIntent.key)return;
    lastIntent.current=meaningIntent.key;
    setDestination("words");
    setSearchState(current=>({...current,query:meaningIntent.headword,applyListFilter:false,collectionId:null,labelId:null,labelName:null,selectedHeadwordGroupId:null,detailSelection:{entryId:meaningIntent.entryId,headword:meaningIntent.headword,contentLanguageCode:meaningIntent.contentLanguageCode},mobileDetailOpen:true}));
  },[meaningIntent,userId]);
  const lastOnboardingSearch=React.useRef<string>();
  useEffect(()=>{if(!onboardingSearch||lastOnboardingSearch.current===onboardingSearch.key)return;lastOnboardingSearch.current=onboardingSearch.key;setDestination('words');setSearchState({...createDictionarySearchTabState(),query:onboardingSearch.query});},[onboardingSearch]);
  const [hasOpened, setHasOpened] = useState(open);
  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);
  const viewedList = activeList ?? lists[0] ?? null;
  const ownChoice=pickedOwn?.userId===userId&&pickedOwn.row.id===searchState.collectionId?pickedOwn:null;
  const sourceLists=ownChoice?.pending&&ownChoice.fresh&&!lists.some(row=>row.id===ownChoice.row.id)?[...lists,ownChoice.row]:lists;
  const refreshOwnChoice=(choice:NonNullable<typeof pickedOwn>)=>{
    const waiting={...choice,pending:true,error:false};setPickedOwn(waiting);
    void Promise.resolve().then(()=>onReloadLists()).then(()=>setPickedOwn(current=>current===waiting?{...waiting,pending:false,fresh:false}:current)).catch(()=>setPickedOwn(current=>current===waiting?{...waiting,pending:false,fresh:false,error:true}:current));
  };
  const userLists = useMemo(
    () => lists.filter((list) => list.type === "user" && list.ownership!=="received"),
    [lists],
  );
  return (
    <CollectionSelectionContext.Provider value={{userId,languageCode:language,onBrowseSelected:row=>{setReceivedSourceId(row.ownership==='received'?row.id:null);if(row.ownership==='owned'){const choice={userId,row:{id:row.id,name:row.name,type:'user' as const,created_at:row.createdAt},pending:true,error:false,fresh:true};refreshOwnChoice(choice);}}}}>
    <section
      aria-hidden={!open}
      className={`${open ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}
    >
      <div
        data-testid="library-workspace"
        className={`${theme.theme} ${workspace.workspace}`}
        data-colour-mode="app"
      >
        <h1 className="sr-only">
          {getUiMessages(interfaceLanguage).library.title}
        </h1>
        <LibraryDestinationTabs language={interfaceLanguage} destination={destination} organizationEnabled={organizationEnabled} sharingEnabled={sharingEnabled} onChange={setDestination}/>
        {pendingCode&&<div className={destination==='shared'?'min-h-0 flex-1 flex flex-col':'hidden'}><InvitationPreview onConfirmed={onInvitationConsumed} userId={userId} code={pendingCode} locale={interfaceLanguage} onClose={closeInvitation} onOpen={(id)=>{closeInvitation();setReceivedSourceId(id);setSearchState({...createDictionarySearchTabState(),applyListFilter:true,collectionId:id});setDestination('words');}}/></div>}
        {sharingEnabled&&!pendingCode&&<div className={destination==='shared'?'min-h-0 flex-1 flex flex-col':'hidden'}>{inputOpen?<InvitationInput locale={interfaceLanguage} onCancel={()=>setInputOpen(false)} onSubmit={code=>{setPendingCode(code);setInputOpen(false);}}/>:<SharedCollectionsWorkspace userId={userId} active={open&&destination==='shared'} locale={interfaceLanguage} view={sharedView} onViewChange={setSharedView} onAdd={()=>setInputOpen(true)} onOpenOwned={row=>{setReceivedSourceId(null);setSearchState({...createDictionarySearchTabState(),applyListFilter:true,collectionId:row.id});setDestination('words');}} onOpenReceived={row=>{setReceivedSourceId(row.id);setSearchState({...createDictionarySearchTabState(),applyListFilter:true,collectionId:row.id});setDestination('words');}}/>}</div>}
        {organizationEnabled && <div className={destination === "collections" ? "min-h-0 flex-1 overflow-hidden" : "hidden"}>
          <PersonalCollections active={open && destination === "collections"} userId={userId} language={language} locale={interfaceLanguage} collections={userLists} onReload={onReloadLists} onOpen={collection => {
            setReceivedSourceId(null);
            setSearchState({...createDictionarySearchTabState(), applyListFilter: true, collectionId: collection.id});
            setDestination("words");
          }} onOpenReceived={collection=>{setReceivedSourceId(collection.id);setSearchState({...createDictionarySearchTabState(),applyListFilter:true,collectionId:collection.id});setDestination('words');}} onOpenLabel={label => {
            setReceivedSourceId(null);
            setSearchState({...createDictionarySearchTabState(), labelId: label.id, labelName: label.name});
            setDestination("words");
          }}/>
        </div>}
        <div className={destination === "words" ? "min-h-0 flex-1 overflow-hidden" : "hidden"}>
          {hasOpened || open ? (
            <DictionarySearchTab
              open={open && destination === "words"}
              preload={false}
              userId={userId}
              language={language}
              translationLang={translationLang}
              interfaceLanguage={interfaceLanguage}
              userLists={userLists}
              collections={receivedSource?[...sourceLists.filter(list=>list.id!==receivedSource.id),receivedSource]:selectedReceivedId?sourceLists.filter(list=>list.id!==selectedReceivedId):sourceLists}
              collectionSourceRead={selectedReceivedId?{collectionId:selectedReceivedId,type:'user',status:receivedRead.status==='ready'?(receivedSource?'ready':'unavailable'):receivedRead.status==='error'?'error':'loading',onRetry:()=>void receivedRead.refresh()}:ownChoice&&!lists.some(row=>row.id===ownChoice.row.id)?{collectionId:ownChoice.row.id,type:'user',status:ownChoice.pending?'loading':ownChoice.error?'error':'unavailable',onRetry:()=>refreshOwnChoice(ownChoice)}:undefined}
              viewedListId={viewedList?.id ?? null}
              viewedList={viewedList}
              viewedListName={viewedList?.name ?? dictionarySourceProfile().coreListName}
              reloadLists={onReloadLists}
              notifyListsUpdated={() => {}}
              onOpenListMembership={onOpenListMembership}
              onTrainWord={onTrainWord}
              autoFocusQuery={open}
              searchState={searchState}
              onSearchStateChange={setSearchState}
            />
          ) : null}
        </div>
      </div>
    </section>
    </CollectionSelectionContext.Provider>
  );
}

export function LibraryDestinationTabs({language,destination,organizationEnabled,sharingEnabled,onChange}:{language:OnboardingLanguage;destination:"words"|"collections"|"shared";organizationEnabled:boolean;sharingEnabled:boolean;onChange:(destination:"words"|"collections"|"shared")=>void}) {
 const copy=organizationCopy(language);
 if(!organizationEnabled&&!sharingEnabled)return null;
 return <nav className={organization.tabs} aria-label={getUiMessages(language).library.title}>
  <button type="button" aria-current={destination==="words"?"page":undefined} onClick={()=>onChange("words")}><List size={14}/>{copy.words}</button>
  {organizationEnabled&&<button type="button" data-onboarding="library-collections" aria-current={destination==="collections"?"page":undefined} onClick={()=>onChange("collections")}><Folders size={14}/>{copy.collections}</button>}
  {sharingEnabled&&<button type="button" data-onboarding="library-shared" aria-current={destination==="shared"?"page":undefined} onClick={()=>onChange("shared")}><Share2 size={14}/>{language==="ru"?"Общий доступ":language==="nl"?"Gedeeld":"Shared"}</button>}
 </nav>;
}
