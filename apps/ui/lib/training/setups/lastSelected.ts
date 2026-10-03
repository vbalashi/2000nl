import type {SavedTraining} from './model';
const key=(ownerId:string)=>`2000nl:last-selected-training:${ownerId}`;
export function readLastSelectedTraining(ownerId:string|undefined):string|null{
 if(!ownerId||typeof window==='undefined')return null;
 try{return window.localStorage.getItem(key(ownerId));}catch{return null;}
}
export function writeLastSelectedTraining(ownerId:string|undefined,id:string){
 if(!ownerId)return;
 try{window.localStorage.setItem(key(ownerId),id);}catch{/* Selection still works without persistent browser storage. */}
}
export function resolveHighlightedTraining(trainings:SavedTraining[],selectedId:string|null,mainId:string|null):string|null{
 return [selectedId,mainId,trainings[0]?.id].find(id=>id&&trainings.some(item=>item.id===id))??null;
}
