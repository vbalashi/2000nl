import en from './locales/en.json';
import nl from './locales/nl.json';
import ru from './locales/ru.json';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
import type {OnboardingSignal} from './signals';
export const tourCopy = {en,nl,ru};
export type TourCopy = typeof en;
export const topics = ['core','collections','card','stats','sharing','incoming','languages','appearance'] as const;
export type TourTopic = typeof topics[number];
export type TourStep = {id:string; target:string; title:keyof TourCopy; body:keyof TourCopy; next?:'click'|'continue'|OnboardingSignal; ready?:string; bypass?:string};
const step=(id:string,target:string,title:keyof TourCopy,body:keyof TourCopy,next:TourStep['next']='click',ready?:string):TourStep=>({id,target,title,body,next,ready});
const navLibrary=step('library','[data-onboarding="nav-library"]','libraryTitle','libraryBody');
const launchBase=step('launch','[data-onboarding="launch"]','startTitle','startBody',undefined,'[data-testid="training-sense-card-stage"]');
const launch={...launchBase,bypass:'[data-testid="training-sense-card-stage"]'};
const faceBase=step('face','[data-testid="training-main-prompt"]','wordTitle','wordBody','continue');
const face={...faceBase,bypass:'[data-testid="training-sense-card-stage"][data-side="answer"]'};
const revealBase=step('reveal','[data-onboarding="reveal"]','revealTitle','revealBody','click','[data-testid="training-sense-card-stage"][data-side="answer"]');
const reveal={...revealBase,bypass:'[data-testid="training-sense-card-stage"][data-side="answer"]'};
const finish=step('done','[data-app-frame]','extrasDoneTitle','topicDoneBody','continue');
const result=step('result','[data-testid="library-headword-group-row"] button, [data-testid="library-sense-card-lead"]','openWordTitle','liveOpenWordBody','click','[data-testid="library-sense-card-group"]');
export const tourFlows:Record<TourTopic,TourStep[]>={
 core:[step('interface','[data-onboarding="interface"]','interfaceTitle','interfaceBody','continue'),step('translation','[data-onboarding="translation"]','translationTitle','translationBody','continue'),step('training','[data-onboarding="nav-training"]','returnTrainingTitle','returnTrainingBody'),launch,face,reveal,step('answer','[data-testid="training-answer-scroll"]','answerTitle','answerBody','continue'),step('practice','[data-onboarding="learn"], [data-testid="training-review-grid"]','liveLearnTitle','liveLearnBody','practice-accepted'),step('exit','[data-onboarding="session-close"]','exitTitle','exitBody'),{...finish,title:'basicDoneTitle',body:'basicDoneBody'}],
 collections:[navLibrary,result,{...step('expand','[data-entry-id][data-expanded="false"] button[aria-expanded="false"]','meaningTitle','meaningBody','click','[data-entry-id][data-expanded="true"]'),bypass:'[data-entry-id][data-expanded="true"]'},step('meaning','[data-entry-id][data-expanded="true"] [data-testid="library-sense-card-lead"]','meaningTitle','meaningBody','continue'),step('collections','[data-onboarding="meaning-collections"]','collectionsTitle','collectionsBody'),step('membership','[data-onboarding="membership-picker"]','collectionsTitle','liveMembershipBody','continue','[data-onboarding="membership-picker"][data-assigned="true"]'),step('membership-close','[data-onboarding="membership-done"]','membershipTitle','membershipBody'),step('training','[data-onboarding="nav-training"]','goTrainingTitle','goTrainingBody'),step('create','[data-onboarding="create-training"] button, button[data-onboarding="create-training"]','createTrainingTitle','createTrainingBody'),{...step('source','[data-onboarding="builder"] [data-builder-section="source"]','sourceTitle','sourceBody'),bypass:'[data-builder-section="source"][aria-expanded="true"]'},step('source-pick','[data-onboarding="source-picker"]','sourcePickTitle','liveSourceBody','continue','[data-onboarding="builder"][data-material-mode="collection"]'),{...step('exercises','[data-onboarding="builder"] [data-builder-section="exercises"]','exercisesTitle','exercisesBody'),bypass:'[data-builder-section="exercises"][aria-expanded="true"]'},step('directions','[data-onboarding="builder"] [data-builder-body="exercises"]','directionTitle','directionBody','continue'),step('save','[data-onboarding="save-training"]','saveTrainingTitle','saveTrainingBody'),step('name','[data-onboarding="confirm-training-save"]','nameTrainingTitle','nameTrainingBody','training-saved'),finish],
 card:[step('training','[data-onboarding="nav-training"]','returnTrainingTitle','returnTrainingBody'),launch,reveal,step('audio','[data-onboarding="audio"]','audioTitle','audioBody'),step('details','[data-onboarding="details"]','detailsTitle','detailsBody'),step('return','dialog:has([data-onboarding="word-details"]) [data-onboarding="details-close"]','returnTitle','returnBody'),{...step('known','[data-onboarding="known"]','knownTitle','knownBody','continue'),bypass:'[data-testid="training-sense-card-stage"]:not(:has([data-onboarding="known"]))'},step('report','[data-onboarding="report"]','reportTitle','reportBody'),step('report-close','[data-onboarding="report-close"]','reportTitle','liveReportBody'),finish],
 stats:[navLibrary,result,step('status','[data-testid="meaning-learning-progress-trigger"]','liveStatsTitle','liveStatsBody'),step('progress','[data-onboarding="progress-close"]','statsViewTitle','statsViewBody'),finish],
 sharing:[navLibrary,step('collections-tab','[data-onboarding="library-collections"]','sharingTabTitle','sharingTabBody'),step('more','[data-onboarding="own-collection-menu"]','sharingMoreTitle','sharingMoreBody'),step('share','[data-menu-action="share"]','sharingMenuTitle','sharingMenuBody'),{...step('open','[data-onboarding="share-open"]','sharingCreateTitle','liveSharingCreateBody'),bypass:'[data-onboarding="copy-link"]'}, {...step('confirm','[data-onboarding="share-confirm"]','sharingConfirmTitle','sharingConfirmBody','click','[data-onboarding="copy-link"]'),bypass:'[data-onboarding="copy-link"]'},step('link','[data-onboarding="copy-link"]','sharingCopyLinkTitle','sharingCopyLinkBody','link-copied'),step('code','[data-onboarding="copy-code"]','sharingCopyCodeTitle','sharingCopyCodeBody','code-copied'),step('close','[data-onboarding="share-close"]','sharingSentTitle','sharingSentBody'),finish],
 incoming:[navLibrary,step('shared','[data-onboarding="library-shared"]','incomingSharedTitle','incomingSharedBody'),step('received','[data-onboarding="shared-received"]','incomingReceivedTitle','incomingReceivedBody'),step('add','[data-onboarding="invitation-add"]','incomingAddTitle','incomingAddBody'),step('input','[data-onboarding="invitation-input"]','incomingInputTitle','liveInvitationBody','click','[data-onboarding="invitation-preview"]'),step('accept','[data-onboarding="invitation-accept"]','incomingPreviewTitle','incomingPreviewBody','click','[data-onboarding="invitation-open"]'),step('open','[data-onboarding="invitation-open"]','incomingAcceptedTitle','incomingAcceptedBody'),finish],
 languages:[step('interface','[data-onboarding="interface"]','interfaceTitle','interfaceBody','continue'),step('translation','[data-onboarding="translation"]','translationTitle','translationBody','continue'),finish],
 appearance:[step('theme','[data-onboarding="appearance"] [role="group"]','appearanceChoiceTitle','appearanceChoiceBody'),step('shortcut','[data-tour="theme-switch"]','themeShortcutTitle','themeShortcutBody'),step('shortcut-done','[data-tour="theme-switch"]','themeShortcutDoneTitle','themeShortcutDoneBody','continue'),finish],
};
export type TourRecord={version:1;topic:TourTopic;step:number;status:'running'|'paused'|'complete';coreCompleted:boolean;collectionId?:string;remaining?:TourTopic[]};
export const tourStorageKey=(userId:string)=>`2000nl:onboarding:v1:${encodeURIComponent(userId)}`;
export function parseTourRecord(raw:string|null):TourRecord|null{
 try {const v=JSON.parse(raw??'null');return v?.version===1&&topics.includes(v.topic)&&Number.isInteger(v.step)&&v.step>=0&&v.step<tourFlows[v.topic as TourTopic].length&&['running','paused','complete'].includes(v.status)&&(v.remaining===undefined||Array.isArray(v.remaining)&&v.remaining.length<=topics.length&&v.remaining.every((topic:unknown)=>topics.includes(topic as TourTopic)))&&typeof v.coreCompleted==='boolean'&&(v.collectionId===undefined||typeof v.collectionId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(v.collectionId))?v:null;}catch{return null;}
}

/** Reopen a dismissed transient panel using its real control; keep mounted drafts intact. */
export function pausePoint(record:TourRecord):number {
 const id=tourFlows[record.topic][record.step].id;
 const opener=record.topic==='collections'?({membership:'collections','membership-close':'collections',name:'save'} as Record<string,string>)[id]
  :record.topic==='card'&&id==='return'?'details'
  :record.topic==='card'&&id==='report-close'?'report'
  :record.topic==='stats'&&id==='progress'?'status'
  :record.topic==='sharing'&&['share','open','confirm','link','code','close'].includes(id)?'more':undefined;
 return opener?tourFlows[record.topic].findIndex(step=>step.id===opener):record.step;
}
