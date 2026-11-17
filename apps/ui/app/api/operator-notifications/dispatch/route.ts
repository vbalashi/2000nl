import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';
import { dispatchOne } from '@/lib/operatorNotifications/dispatch';
export const runtime='nodejs';
export const dynamic='force-dynamic';

function validSecret(value: string | undefined): value is string {
 return !!value && value.length>=32 && value.length<=256;
}
function equalSecret(a: string,b: string) {
 const left=Buffer.from(a),right=Buffer.from(b);
 return left.length===right.length && timingSafeEqual(left,right);
}
function authorized(request:Request,allowStatus=false) {
 const dispatch=process.env.OPERATOR_NOTIFICATION_DISPATCH_SECRET;
 const status=process.env.OPERATOR_NOTIFICATION_STATUS_SECRET;
 const value=request.headers.get('authorization');
 const given=value?.startsWith('Bearer ')?value.slice(7):'';
 // Equal configured keys would silently grant a status observer write access.
 if(validSecret(dispatch) && validSecret(status) && equalSecret(dispatch,status)) return false;
 if(validSecret(dispatch) && equalSecret(given,dispatch)) return true;
 return allowStatus && validSecret(dispatch) && validSecret(status) && equalSecret(given,status);
}
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request:Request) {
 if (!authorized(request,true)) return respond({error:'unauthorized'},401);
 try {
  const {data,error}=await createAdminServiceClient().rpc('operator_notification_status_v1');
  if(error || !data || typeof data!=='object' || Array.isArray(data)) throw new Error('status unavailable');
  const {pending,leased,failed,oldestPendingAt}=data;
  if(![pending,leased,failed].every(value=>Number.isSafeInteger(value) && value>=0) || !(oldestPendingAt===null || (typeof oldestPendingAt==='string' && Number.isFinite(Date.parse(oldestPendingAt))))) throw new Error('status unavailable');
  return respond({pending,leased,failed,oldestPendingAt});
 } catch {return respond({error:'unavailable'},503);}
}
export async function POST(request:Request) {
 if (!authorized(request)) return respond({error:'unauthorized'},401);
 try {const status=await dispatchOne();return respond({status},status==='disabled'?503:200);}
 catch {return respond({error:'unavailable'},503);}
}

export async function DELETE(request:Request) {
 if (!authorized(request)) return respond({error:'unauthorized'},401);
 try {
  const {data,error}=await createAdminServiceClient().rpc('operator_notification_cleanup_v1');
  if(error || !Number.isInteger(data) || data<0) throw new Error('cleanup unavailable');
  return respond({removed:data});
 } catch {return respond({error:'unavailable'},503);}
}
