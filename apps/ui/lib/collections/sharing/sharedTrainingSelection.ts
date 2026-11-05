import { localizedField } from "@/lib/i18n/catalog";
import type {ActiveTrainingScope,WordListSummary} from '@/lib/types';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
const loadError=localizedField("sharedTrainingSelection", "error");
const unavailable=localizedField("sharedTrainingSelection", "unavailable");
/** A revoked saved source remains explicit; never turn it into an all-material run. */
export function unavailableReceivedSelection(scope:ActiveTrainingScope,locale:OnboardingLanguage):WordListSummary|null{
 return scope.activeListId?{id:scope.activeListId,type:'user',name:(scope.isValid?loadError:unavailable)[locale],ownership:'received',...(scope.isValid?{}:{item_count:0,available_item_count:0})}:null;
}
