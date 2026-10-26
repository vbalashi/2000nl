import {platformV2AuthenticatedJsonHeaders} from './platformV2Http';
import {platformFetchWithTimeout} from './platformFetchWithTimeout';
import {parseEntryNoteMaterial} from './entryNoteMaterialContract';
export async function readEntryNoteMaterial(userId:string,entryId:string,signal:AbortSignal){
 const headers=await platformV2AuthenticatedJsonHeaders(userId);
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 const response=await platformFetchWithTimeout('/api/library/entries/'+encodeURIComponent(entryId)+'/note-material',{headers,cache:'no-store',signal});
 if(response.status===404)return [];
 if(!response.ok)throw new Error('note_material_unavailable');
 const parsed=parseEntryNoteMaterial(await response.json(),entryId);
 await platformV2AuthenticatedJsonHeaders(userId);
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 if(!parsed)throw new Error('note_material_contract_invalid');
 return parsed.notes;
}
