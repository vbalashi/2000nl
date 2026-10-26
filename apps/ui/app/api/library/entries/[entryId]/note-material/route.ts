import {NextRequest} from 'next/server';
import {jsonNoStore} from '@/lib/platform/serverSupabase';
import {authorizeNoteRequest} from '@/lib/collections/sharing/noteRouteSupport';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseEntryNoteMaterial} from '@/lib/platform/entryNoteMaterialContract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(request:NextRequest,{params}:{params:Promise<{entryId:string}>}){
 const auth=await authorizeNoteRequest(request,false);if(auth instanceof Response)return auth;
 const {entryId:requested}=await params;
 if(!copyUuid(requested)||request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_note_request'},400);
 const entryId=requested.toLowerCase();
 try{
  const {data,error}=await auth.supabase.rpc('read_entry_note_material_v1',{p_entry_ids:[entryId]});
  if(error){
   if(error.code==='42501')return jsonNoStore({error:'note_entry_unavailable'},404);
   if(error.code==='PGRST202'||error.code==='42883')return jsonNoStore({error:'notes_not_available'},503);
   if(error.message==='note_material_too_large')return jsonNoStore({error:'note_material_too_large'},422);
   return jsonNoStore({error:'note_request_failed'},500);
  }
  const parsed=data&&Object.keys(data).length===1&&Array.isArray(data.entries)&&data.entries.length===1
   ?parseEntryNoteMaterial(data.entries[0],entryId):null;
  return parsed?jsonNoStore(parsed):jsonNoStore({error:'note_contract_invalid'},502);
 }catch{return jsonNoStore({error:'note_request_failed'},500);}
}
