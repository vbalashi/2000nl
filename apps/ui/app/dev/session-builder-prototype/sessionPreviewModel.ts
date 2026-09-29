import type {LibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import type {Draft} from "./model";
import fixture from "./word-details-fixture.json";
import {goedGroups} from "./GoedLibraryPreview";

export type PreviewRating="Again"|"Hard"|"Good"|"Easy";
export type PreviewAction={id:string;word:string;exercise:string;result:PreviewRating|"Known"|"Excluded";at:string};
export type PreviewRun={id:number;trainingId:string;name:string;draft:Draft;translation:string};
export type PreviewExercise={model:LibrarySenseCardGroupModel;meaning:LibrarySenseCardGroupModel["meanings"][number];prompt:string;answer:string;kind:string;headwordPrompt:boolean};
const groups=fixture.groups as LibrarySenseCardGroupModel[];
// These fixtures illustrate interaction only; no queue, scheduler or source eligibility is inferred.
export function previewExercise(run:PreviewRun,index:number):PreviewExercise{
 const type=run.draft.types[index%run.draft.types.length]||"Words";
 const model=[...groups.slice(0,3),...goedGroups][index%([...groups.slice(0,3),...goedGroups].length)];
 const meaning=model.meanings[Math.floor(index/6)%model.meanings.length];
 const word=[model.article,model.headword].filter(Boolean).join(" ");
 const reverse=run.draft.directions[index%run.draft.directions.length]==="Reverse";
 if(type==="Translation")return {model:groups[0],meaning:groups[0].meanings[0],prompt:"I cycle to work.",answer:"Ik ga met de fiets naar mijn werk.",kind:"Translation · English → Dutch",headwordPrompt:false};
 if(type==="Idioms")return {model:goedGroups[2],meaning:goedGroups[2].meanings[0],prompt:reverse?"Iets wordt gewaardeerd.":"iets valt in goede aarde",answer:reverse?"iets valt in goede aarde":"Iets wordt gewaardeerd.",kind:`Idioms · ${reverse?"Reverse":"Direct"}`,headwordPrompt:!reverse};
 return {model,meaning,prompt:reverse?meaning?.definition?.text||word:word,answer:reverse?word:meaning?.definition?.text||word,kind:`Words · ${reverse?"Reverse":"Direct"}`,headwordPrompt:!reverse};
}
export const previewHistory:PreviewAction[]=[
 {id:"seed-1",word:"goed",exercise:"Words · Direct",result:"Good",at:"2026-09-28T15:42:00Z"},
 {id:"seed-2",word:"de fiets",exercise:"Words · Reverse",result:"Hard",at:"2026-09-28T15:41:00Z"},
 {id:"seed-3",word:"het huis",exercise:"Words · Direct",result:"Easy",at:"2026-09-27T09:20:00Z"},
];
