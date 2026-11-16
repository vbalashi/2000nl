import 'server-only';
import { NextResponse } from 'next/server';
import { createAdminAuthClient,clearAdminAuthCookies } from '@/lib/admin/adminServerClient';
import { consumeAdminReturnUrl } from '@/lib/admin/adminAuthReturn';
import { registerAdminSession } from '@/lib/admin/adminSignInSession';
import { adminEmailEnabled,adminAuthOrigin,adminAuthSameOrigin,adminEmail,adminAuthInput } from '@/lib/admin/adminEmailAuth';
import { readAdminAuditContext,writeAdminAuditEvent } from '@/lib/admin/adminAuditRepository';
export const dynamic='force-dynamic';
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
export async function POST(request: Request) {
 if(!adminAuthSameOrigin(request))return respond({error:'request_rejected'},403);
 if(!adminEmailEnabled())return respond({error:'unavailable'},503);
 let email:string|null;let token:string;
 try {
  const input=await adminAuthInput(request);email=adminEmail(input?.email);const candidate=input?.token;
  if(!email || typeof candidate!=='string' || !/^[0-9]{6,10}$/.test(candidate) || Object.keys(input).length!==2)throw new Error();
  token=candidate;
 } catch {return respond({error:'invalid_request'},400);}
 let auth:Awaited<ReturnType<typeof createAdminAuthClient>>|undefined;
 let registering=false;
 try {
  auth=await createAdminAuthClient();
  const {data,error}=await auth.auth.verifyOtp({email,token,type:'email'});
  if(error || !data.session?.access_token || data.user?.email?.toLowerCase()!==email) {
   await writeAdminAuditEvent({action:'auth.sign_in_denied',outcome:'denied',targetType:'email',context:readAdminAuditContext(request.headers)});
   throw new Error('verification failed');
  }
  registering=true;
  await registerAdminSession(request,auth,'email',email);
  return respond({url:await consumeAdminReturnUrl(adminAuthOrigin(request)!)});
 } catch {
  if(!registering) {
   try {await auth?.auth.signOut({scope:'local'});} catch { /* Local cookie must still be cleared. */ }
   await clearAdminAuthCookies();
  }
  return respond({error:auth?'signin_failed':'unavailable'},auth?401:503);
 }
}
