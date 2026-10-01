import type {LibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import data from "./goed-source-fixture.json";
import {withDemoTranslation,demoEntryTranslations} from "./libraryTranslationFixture";
export const goedGroups=(data as LibrarySenseCardGroupModel[]).map((group,g)=>({...group,meanings:group.meanings.map((meaning,m)=>({...meaning,entryTranslation:demoEntryTranslations[g][m][0],entryTranslationAlternatives:demoEntryTranslations[g][m].slice(1),definition:meaning.definition?withDemoTranslation(meaning.definition):null,details:meaning.details.map(withDemoTranslation)}))}));
