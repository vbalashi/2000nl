import { NextResponse } from 'next/server';
import { adminErrorResponse, requireAdmin } from '@/lib/admin/adminAccess';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';
export const dynamic='force-dynamic';
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'}});

export async function GET(request:Request) {
 try {
  const principal=await requireAdmin(request,'notifications.manage');
  const {data,error}=await createAdminServiceClient().rpc('admin_notification_configuration_v1',{p_operator:principal.userId,p_request:principal.requestId});
  if(error)throw new Error('configuration unavailable');
  return response(data);
 } catch(error){return adminErrorResponse(error);}
}
export async function POST(request:Request) {
 try {
  const principal=await requireAdmin(request,'notifications.manage');
  const configured=process.env.ADMIN_SITE_URL;
  const origin=configured?new URL(configured).origin:process.env.NODE_ENV==='development'?new URL(request.url).origin:null;
  if(!origin || request.headers.get('origin')!==origin)return response({error:'request_rejected'},403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return response({error:'invalid_request'},400);
  const reader=request.body?.getReader();if(!reader)return response({error:'invalid_request'},400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024){await reader.cancel();return response({error:'request_too_large'},413);}chunks.push(part.value);}
  let input:unknown;
  try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return response({error:'invalid_request'},400);}
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).length!==1 || !('name' in input) || typeof input.name!=='string' || input.name.trim().length<1 || input.name.trim().length>80)return response({error:'invalid_request'},400);
  const {data,error}=await createAdminServiceClient().rpc('admin_notification_create_bot_v1',{p_operator:principal.userId,p_request:principal.requestId,p_name:input.name.trim()});
  if(error)throw new Error('configuration unavailable');
  return response({bot:data},201);
 }catch(error){return adminErrorResponse(error);}
}
