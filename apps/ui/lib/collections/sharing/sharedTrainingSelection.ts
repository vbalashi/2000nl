import type {ActiveTrainingScope,WordListSummary} from '@/lib/types';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
const loadError={en:'Could not load collection details.',ru:'Не удалось загрузить сведения о коллекции.',nl:'Collectiegegevens konden niet worden geladen.'};
const unavailable={en:'This collection is no longer available.',ru:'Эта коллекция больше недоступна.',nl:'Deze collectie is niet meer beschikbaar.'};
/** A revoked saved source remains explicit; never turn it into an all-material run. */
export function unavailableReceivedSelection(scope:ActiveTrainingScope,locale:OnboardingLanguage):WordListSummary|null{
 return scope.activeListId?{id:scope.activeListId,type:'user',name:(scope.isValid?loadError:unavailable)[locale],ownership:'received',...(scope.isValid?{}:{item_count:0,available_item_count:0})}:null;
}
