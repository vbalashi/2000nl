import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';
import { dispatchOne } from '@/lib/operatorNotifications/dispatch';
export const runtime='nodejs';
export const dynamic='force-dynamic';

function authorized(request:Request) {
 const expected=process.env.OPERATOR_NOTIFICATION_DISPATCH_SECRET;
 const value=request.headers.get('authorization');
 const given=value?.startsWith('Bearer ')?value.slice(7):'';
 return !!expected && expected.length>=32 && expected.length<=256 && Buffer.byteLength(given)===Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(given),Buffer.from(expected));
}
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request:Request) {
 if (!authorized(request)) return respond({error:'unauthorized'},401);
 try {
  const {data,error}=await createAdminServiceClient().rpc('operator_notification_status_v1');
  if(error || !data || typeof data!=='object') throw new Error('status unavailable');
  return respond(data);
 } catch {return respond({error:'unavailable'},503);}
}
export async function POST(request:Request) {
 if (!authorized(request)) return respond({error:'unauthorized'},401);
 try {const status=await dispatchOne();return respond({status},status==='disabled'?503:200);}
 catch {return respond({error:'unavailable'},503);}
}
