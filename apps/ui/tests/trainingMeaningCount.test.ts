import {expect,test} from "vitest";
import {completeTrainingMeaningCount} from "@/lib/platform/trainingMeaningCount";
import type {DictionaryLookupPayload} from "@/lib/platform/lookupService";
const item=(ordinal:number,kind="curated")=>({id:`entry-${ordinal}`,headword:"bank",raw:{},dictionary_id:"dictionary",dictionary:{id:"dictionary",kind,language_code:"nl",slug:"demo",name:"Demo",visibility:"system",schema_key:null,schema_version:null},platform_v2_identity:{entryId:`entry-${ordinal}`,headwordGroupId:"group",meaningOrdinal:ordinal}});
const target=(kind="curated")=>item(1,kind) satisfies DictionaryLookupPayload;
const page={selectedTierComplete:true,nextGroupCursor:null};
const article=(items:unknown[])=>({items,page});
test("accepts a complete curated article under uniform dictionary-level train access",()=>{
 expect(completeTrainingMeaningCount(article([item(3),item(1),item(2)]),target(),50)).toBe(3);
});
test.each([[1,3],[1,2]])("never treats a visible shared subset %j as a complete article",(...ordinals)=>{
 expect(completeTrainingMeaningCount(article(ordinals.map(ordinal=>item(ordinal,"user"))),target("user"),50)).toBeUndefined();
});
test.each([
 {items:[item(1),item(3)],page},
 {items:[item(1),item(2)]},
 {items:[item(1),item(2)],page:{...page,selectedTierComplete:false}},
 {items:[item(1),item(2)],page:{...page,nextGroupCursor:"next"}},
 {items:[item(1),item(1)],page},
 {items:[item(1),{...item(2),id:"different-id"}],page},
 {items:[item(2)],page},
 {items:[item(1),{...item(2),platform_v2_identity:{...item(2).platform_v2_identity,headwordGroupId:"other-group"}}],page},
 {items:[item(1),{...item(2),dictionary_id:"other-dictionary"}],page},
 {items:Array.from({length:51},(_,index)=>item(index+1)),page},
])("hides totals without bounded complete consistent identity: %#",payload=>{
 expect(completeTrainingMeaningCount(payload,target(),50)).toBeUndefined();
});
