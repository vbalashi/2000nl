import type {ReceivedCollection} from "@/lib/collections/sharing/receivedCatalogContract";
import type {SharePreview} from "@/lib/collections/sharing/shareCommandContract";
import {gateBankGroup} from "@/lib/platform/fixtures/senseCardV1GateFixture";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import type {Journey} from "./journeyState";
export const incomingCode="11111111111111111111111111";
export const incomingId="00000000-0000-4000-8000-000000000020";
export const incomingName=(language:OnboardingLanguage)=>({ru:"Карточки для прогулки по городу",en:"Cards for a walk around town",nl:"Kaarten voor een wandeling door de stad"}[language]);
export function incomingPreview(language:OnboardingLanguage,name=incomingName(language)):SharePreview {
 return {collectionId:incomingId,name,entryCount:2,offeredRole:"viewer",role:null,alreadyAdded:false,
  samples:[{headword:"de bank",definition:"een zitmeubel voor meerdere mensen"},{headword:"de bank",definition:"een bedrijf dat geld bewaart, leent en betalingen regelt"}]};
}
export function incomingRow(language:OnboardingLanguage,name=incomingName(language)):ReceivedCollection {
 return {id:incomingId,name,createdAt:"2026-01-01T00:00:00Z",addedAt:"2026-01-01T00:00:00Z",ownerUserId:"00000000-0000-4000-8000-000000000021",role:"viewer",itemCount:2,labelIds:[]};
}
export function acceptIncoming(journey:Journey,language:OnboardingLanguage):Journey {
 if(journey.collections.some(collection=>collection.id===incomingId))return journey;
 return {...journey,collections:[...journey.collections,{id:incomingId,name:incomingName(language),ownership:"received",entryIds:gateBankGroup.entries.filter(entry=>entry.kind==="sense-card").map(entry=>entry.entryId)}]};
}
