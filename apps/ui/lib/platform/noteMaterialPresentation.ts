import type {PlatformHeadwordGroupV2} from '../../../../packages/shared/types/platformV2';
/** A cached article/current-card permit is not fresh authority for overlays. */
export function clearPlatformNoteMaterial(group:PlatformHeadwordGroupV2, retainOwnerId?:string):PlatformHeadwordGroupV2{
 const entries=group.entries.map(entry=>{
   if(entry.kind!=="sense-card" || !entry.noteMaterial?.length) return entry;
   const notes=entry.noteMaterial.filter(note=>retainOwnerId && note.isOwn && note.ownerUserId===retainOwnerId);
   return notes.length===entry.noteMaterial.length ? entry : {...entry,noteMaterial:notes};
 });
 return entries.every((entry,index)=>entry===group.entries[index]) ? group : {...group,entries};
}
