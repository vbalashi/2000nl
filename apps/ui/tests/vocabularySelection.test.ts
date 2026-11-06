import {expect,test} from "vitest";
import {DEFAULT_VOCABULARY_SELECTION,parseVocabularySelection,parseLibraryTrainingSelection} from "@/lib/vocabulary/selection";
import {librarySelectionToTraining} from "@/lib/vocabulary/libraryTrainingHandoff";
import {availabilityRecipeKey,availabilityRpcScope,parseAvailabilityRecipe} from "@/lib/training/availability/model";
import {canonicalDraft} from "@/lib/training/setups/model";
import type {TrainingSetupDraft} from "@/lib/training/setups/types";
const draft:TrainingSetupDraft={family:'meaning',modes:['word-to-definition'],cardFilter:'both',scenarioId:'understanding',materialMode:'all-dictionaries',listValue:'',dateWindow:'all',sourceValue:'all',newReviewRatio:2,sessionSize:10};
test('closed wire formats reject malformed and ambiguous choices',()=>{
 const valid={...DEFAULT_VOCABULARY_SELECTION,mode:'frequency',meanings:2};expect(parseVocabularySelection(valid)).toEqual(valid);
 for(const invalid of [null,{}, {...valid,from:0},{...valid,to:0},{...valid,to:1.5},{...valid,meanings:6},{...valid,mode:['frequency']},{...valid,profile:['spoken']},{...valid,materialKinds:['word','other']},{...valid,extra:true}])expect(parseVocabularySelection(invalid)).toBeNull();
 expect(parseLibraryTrainingSelection({query:'x',category:['headwords']})).toBeNull();
});
test('Library handoff copies criteria with all source types, never result page IDs',()=>{
 const base={languageCode:'nl',filters:{parts:['noun','prefix'] as const,article:'het' as const,vocabulary:{...DEFAULT_VOCABULARY_SELECTION,meanings:2 as const}},query:' lopen ',category:'definitions' as const};
 const selection=librarySelectionToTraining({...base,filters:{...base.filters,parts:[...base.filters.parts]},dictionaryId:'dictionary'});
 expect(selection.material).toMatchObject({materialMode:'selected-dictionaries',dictionaryIds:['dictionary'],partOfSpeech:['zn','vv'],nounArticles:['het'],librarySelection:{query:'lopen',category:'definitions'},dateWindow:'all',sourceValue:'all'});
 expect(selection.material).not.toHaveProperty('sessionSize');expect(selection.material).not.toHaveProperty('newReviewRatio');expect(selection.material.vocabulary).not.toBe(base.filters.vocabulary);
 expect(librarySelectionToTraining({...base,filters:{...base.filters,parts:[]},collection:{id:'collection',type:'user'}}).material).toMatchObject({materialMode:'collection',listValue:'user:collection'});
 expect(librarySelectionToTraining({...base,filters:{...base.filters,parts:[]},labelId:'label',labelName:'Lessons'}).material).toMatchObject({materialMode:'all-dictionaries',librarySelection:{labelId:'label',labelName:'Lessons'}});
});
test('saved drafts and counts retain semantic filters; display names and session budgets do not change count identity',()=>{
 const recipe={languageCode:'nl',draft:{...draft,partOfSpeech:['vv' as const],vocabulary:{...DEFAULT_VOCABULARY_SELECTION,meanings:2 as const},librarySelection:{query:'lopen',category:'headwords' as const,labelName:'Original'}}};
 expect(parseAvailabilityRecipe(recipe)).toEqual(recipe);expect(canonicalDraft(recipe.draft).vocabulary).toEqual(recipe.draft.vocabulary);
 const renamed={...recipe,draft:{...recipe.draft,sessionSize:50,newReviewRatio:5,cardFilter:'new' as const,librarySelection:{...recipe.draft.librarySelection,labelName:'Renamed'}}};
 expect(availabilityRecipeKey(renamed)).toBe(availabilityRecipeKey(recipe));expect(availabilityRpcScope(recipe).p_training_filter.librarySelection).toEqual({query:'lopen',category:'headwords'});
 expect(availabilityRecipeKey({...recipe,draft:{...recipe.draft,vocabulary:{...recipe.draft.vocabulary,meanings:3}}})).not.toBe(availabilityRecipeKey(recipe));
});

test("legacy both-article drafts mean no article restriction for counts and Start",()=>{expect(availabilityRpcScope({languageCode:"nl",draft:{...draft,partOfSpeech:[],nounArticles:["de","het"]}}).p_training_filter.nounArticles).toBeUndefined();});
test('collection handoff pins its selected language even without a search query',()=>{
 const handoff=librarySelectionToTraining({languageCode:'en',filters:{parts:[],article:null},query:'',collection:{id:'collection',type:'user'}});
 expect(handoff.material.librarySelection).toEqual({languageCode:'en',query:'',category:'headwords'});
 expect(parseAvailabilityRecipe({languageCode:'nl',draft:{...draft,librarySelection:handoff.material.librarySelection}})).toBeNull();
});
