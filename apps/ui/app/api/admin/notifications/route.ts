import { handleDestinationAction, readTelegramDestinations } from './destinations';
import { handleTemplateAction, readTemplates } from './templates';
import { storeBotToken } from '@/lib/operatorNotifications/secretBroker';
import { NextResponse } from 'next/server';
import { adminErrorResponse, requireAdmin } from '@/lib/admin/adminAccess';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';
export const dynamic='force-dynamic';
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'}});

export async function GET(request:Request) {
 try {
  const principal=await requireAdmin(request,'notifications.manage');
  const view=new URL(request.url).searchParams.get('view');
  if(view==='telegram-destinations')return await readTelegramDestinations(principal,response);
  if(view==='templates')return await readTemplates(principal,response);
  const {data,error}=await createAdminServiceClient().rpc('admin_notification_configuration_v3',{p_operator:principal.userId,p_request:principal.requestId});
  if(error)throw new Error('configuration unavailable');
  return response(data);
 } catch(error){return adminErrorResponse(error);}
}
async function mutate(request:Request,kind:"bot"|"route"|"secret") {
 try {
  const principal=await requireAdmin(request,'notifications.manage');
  const configured=process.env.ADMIN_SITE_URL;
  const origin=configured?new URL(configured).origin:process.env.NODE_ENV==='development'?new URL(request.url).origin:null;
  if(!origin || request.headers.get('origin')!==origin)return response({error:'request_rejected'},403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return response({error:'invalid_request'},400);
  const reader=request.body?.getReader();if(!reader)return response({error:'invalid_request'},400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>(kind==='bot'?16384:kind==='route'?2048:1024)){await reader.cancel();return response({error:'request_too_large'},413);}chunks.push(part.value);}
  let input:unknown;
  try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return response({error:'invalid_request'},400);}
  const templateAction=kind==='bot' && input && typeof input==='object' && !Array.isArray(input) && 'action' in input
   && ['preview-template','publish-template','test-template','save-test-destination'].includes(input.action as string);
  const destinationAction=kind==='bot' && input && typeof input==='object' && !Array.isArray(input) && 'action' in input
   && ['link-telegram-destination','create-telegram-topic'].includes(input.action as string);
  if(size>1024 && kind==='bot' && !templateAction)return response({error:'request_too_large'},413);
  if(kind==='bot' && input && typeof input==='object' && 'action' in input && input.action==='archive-bot') {
   const {botId,revision}=input as Record<string,unknown>;
   if(typeof botId!=='string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(botId)
    || typeof revision!=='number' || !Number.isInteger(revision) || revision<1 || revision>2147483647) {
    return response({error:'invalid_request'},400);
   }
   const {data,error}=await createAdminServiceClient().rpc('admin_archive_notification_bot_v1',{
    p_operator:principal.userId,p_request:principal.requestId,p_bot:botId,p_revision:revision,
   });
   if(error)throw new Error('bot archive unavailable');
   return data===true ? response({archived:true}) : response({error:'revision_conflict'},409);
  }
  if(destinationAction)return await handleDestinationAction(input as Record<string,unknown>,principal,response);
  if(templateAction) {
   return await handleTemplateAction(input as Record<string,unknown>,principal,response);
  }
  if(kind==='bot' && input && typeof input==='object' && !Array.isArray(input) && Object.keys(input).length===1 && 'enabled' in input && typeof input.enabled==='boolean'){
   const {data,error}=await createAdminServiceClient().rpc('admin_notification_enabled_v1',{p_operator:principal.userId,p_request:principal.requestId,p_enabled:input.enabled});
   if(error)throw new Error('configuration unavailable');
   return response({enabled:data});
  }
  if(kind==='secret') {
   if(!input || typeof input!=='object' || Array.isArray(input))return response({error:'invalid_request'},400);
   const value=input as Record<string,unknown>;
   if(Object.keys(value).length!==3 || typeof value.botId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.botId)
    || !Number.isInteger(value.revision) || (value.revision as number)<1 || (value.revision as number)>2147483647
    || typeof value.token!=='string' || !/^[0-9]{1,20}:[A-Za-z0-9_-]{1,200}$/.test(value.token))return response({error:'invalid_request'},400);
   const service=createAdminServiceClient();
   const begin=await service.rpc('admin_notification_begin_secret_v1',{p_operator:principal.userId,p_request:principal.requestId,p_bot:value.botId,p_revision:value.revision});
   if(begin.error?.code==='40001')return response({error:'revision_conflict'},409);
   if(begin.error || begin.data?.operation!==principal.requestId)throw new Error('secret operation unavailable');
   let version:string|null=null;
   try{version=await storeBotToken(value.botId,principal.requestId,value.token);}catch{/* Fail closed without exposing provider details. */}
   const finished=await service.rpc('admin_notification_finish_secret_v1',{p_operator:principal.userId,p_request:principal.requestId,p_bot:value.botId,p_operation:principal.requestId,p_version:version});
   if(finished.error)throw new Error('secret operation unavailable');
   if(finished.data!==true)return response({error:'revision_conflict'},409);
   if(!version)return response({error:'secret_storage_unavailable'},503);
   return response({saved:true});
  }
  if(kind==='route') {
   if(!input || typeof input!=='object' || Array.isArray(input))return response({error:'invalid_request'},400);
   const route=input as Record<string,unknown>;
   const keys=['id','revision','botId','kind','chatId','topicId','enabled'];
   const named='chatTitle' in route || 'topicTitle' in route;
   if(named)keys.push('chatTitle','topicTitle');
   const validTitle=(value:unknown)=>value===null || (typeof value==='string' && Array.from(value.trim()).length<=120 && !value.includes('\0'));
   if(named&&(!validTitle(route.chatTitle)||!validTitle(route.topicTitle)))return response({error:'invalid_route'},400);
   const uuid=(value:unknown)=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
   if(Object.keys(route).length!==keys.length || keys.some(key=>!(key in route)) || (route.id!==null && !uuid(route.id)) || !uuid(route.botId)
    || !Number.isInteger(route.revision) || (route.revision as number)<0 || (route.revision as number)>2147483647
    || !['admission-request','feedback','deployment'].includes(route.kind as string) || typeof route.chatId!=='string' || !/^-?[1-9][0-9]{0,19}$/.test(route.chatId)
    || (route.topicId!==null && (!Number.isSafeInteger(route.topicId) || (route.topicId as number)<1)) || typeof route.enabled!=='boolean')return response({error:'invalid_request'},400);
   const {data,error}=await createAdminServiceClient().rpc(named?'admin_notification_save_route_v2':'admin_notification_save_route_v1',{p_operator:principal.userId,p_request:principal.requestId,p_id:route.id,p_revision:route.revision,p_bot:route.botId,p_kind:route.kind,p_chat:route.chatId,p_topic:route.topicId,p_enabled:route.enabled,...(named?{p_chat_title:route.chatTitle,p_topic_title:route.topicTitle}:{})});
   if(error?.code==='40001')return response({error:'revision_conflict'},409);
   if(error?.code==='22023')return response({error:'invalid_route'},400);
   if(error)throw new Error('configuration unavailable');
   return response({route:data});
  }
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).length!==1 || !('name' in input) || typeof input.name!=='string' || input.name.trim().length<1 || input.name.trim().length>80)return response({error:'invalid_request'},400);
  const {data,error}=await createAdminServiceClient().rpc('admin_notification_create_bot_v1',{p_operator:principal.userId,p_request:principal.requestId,p_name:input.name.trim()});
  if(error)throw new Error('configuration unavailable');
  return response({bot:data},201);
 }catch(error){return adminErrorResponse(error);}
}

export async function POST(request:Request){return mutate(request,"bot");}
export async function PUT(request:Request){return mutate(request,"route");}

export async function PATCH(request:Request){return mutate(request,"secret");}
