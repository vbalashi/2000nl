import {NextRequest} from 'next/server';
import {jsonNoStore,type AuthenticatedSupabase} from '@/lib/platform/serverSupabase';
import {copyUuid} from '@/lib/platform/independentEntryCopyContract';
import {parseOwnNote,parseOwnNoteWriteResult,parseOwnNoteCommand,type OwnNoteCommand} from '@/lib/collections/sharing/noteContract';
import {authorizeNoteRequest as authorize} from '@/lib/collections/sharing/noteRouteSupport';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
type Context={params:Promise<{entryId:string}>};
async function invoke(auth:AuthenticatedSupabase,entryId:string,command?:OwnNoteCommand){
 try{
  const {data,error}=await auth.supabase.rpc(command?'write_entry_note_v1':'read_entry_note_v1',{
   p_entry_id:entryId,...(command?{p_expected_revision:command.expectedRevision,p_notes:command.notes}:{}),
  });
  if(error){
   if(error.message==='sharing_writes_disabled')return jsonNoStore({error:'sharing_writes_disabled'},503);
   if(error.message==='note_changed')return jsonNoStore({error:'note_changed'},409);
   if(error.code==='42501')return jsonNoStore({error:'note_entry_unavailable'},404);
   if(error.message==='invalid_note_request')return jsonNoStore({error:'invalid_note_request'},422);
   if(error.code==='PGRST202'||error.code==='42883')return jsonNoStore({error:'notes_not_available'},503);
   return jsonNoStore({error:'note_request_failed'},500);
  }
  const parsed=command?parseOwnNoteWriteResult(data,entryId,command):parseOwnNote(data,entryId);
  return parsed?jsonNoStore(parsed):jsonNoStore({error:'note_contract_invalid'},502);
 }catch{return jsonNoStore({error:'note_request_failed'},500);}
}
async function readBody(request:NextRequest):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)return null;
 const decoder=new TextDecoder('utf-8',{fatal:true});let value='',bytes=0;
 try{
  for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;
   if(bytes>400*1024){await reader.cancel();return null;}
   value+=decoder.decode(chunk.value,{stream:true});
  }
  value+=decoder.decode();return JSON.parse(value);
 }catch{return null;}finally{reader.releaseLock();}
}
export async function GET(request:NextRequest,{params}:Context){
 const auth=await authorize(request,false);if(auth instanceof Response)return auth;
 const {entryId}=await params;
 if(!copyUuid(entryId)||request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_note_request'},400);
 return invoke(auth,entryId.toLowerCase());
}
export async function PUT(request:NextRequest,{params}:Context){
 const auth=await authorize(request,true);if(auth instanceof Response)return auth;
 const {entryId}=await params;
 if(!copyUuid(entryId)||request.nextUrl.searchParams.size)return jsonNoStore({error:'invalid_note_request'},400);
 const command=parseOwnNoteCommand(await readBody(request));
 return command?invoke(auth,entryId.toLowerCase(),command):jsonNoStore({error:'invalid_note_request'},400);
}
