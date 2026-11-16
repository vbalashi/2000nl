import 'server-only';
import { NextResponse } from 'next/server';
import { createAdminAuthClient,clearAdminAuthCookies } from '@/lib/admin/adminServerClient';
import { consumeAdminReturnUrl } from '@/lib/admin/adminAuthReturn';
import { registerAdminSession } from '@/lib/admin/adminSignInSession';
import { adminEmailEnabled,adminAuthOrigin } from '@/lib/admin/adminEmailAuth';
import { readAdminAuditContext,writeAdminAuditEvent } from '@/lib/admin/adminAuditRepository';
export const dynamic='force-dynamic';
export const fetchCache='force-no-store';
export async function GET(request:Request) {
 const origin=adminAuthOrigin(request),code=new URL(request.url).searchParams.get('code');
 const redirect=(failure:boolean)=>{const response=NextResponse.redirect(new URL(failure?'/admin?view=login&state=signin-error':'/admin',origin??'http://localhost'));response.headers.set('Cache-Control','private, no-store, max-age=0');return response;};
 if(!origin || !code || !adminEmailEnabled())return redirect(true);
 let auth:Awaited<ReturnType<typeof createAdminAuthClient>>|undefined;let registering=false;
 try {
  auth=await createAdminAuthClient();
  const {data,error}=await auth.auth.exchangeCodeForSession(code);
  if(error || !data.user?.email || !data.session?.access_token)throw new Error('invalid exchange');
  registering=true;await registerAdminSession(request,auth,'email',data.user.email.toLowerCase());
  const response=NextResponse.redirect(new URL(await consumeAdminReturnUrl(origin),origin));response.headers.set('Cache-Control','private, no-store, max-age=0');return response;
 } catch {
  if(!registering){
   try {await writeAdminAuditEvent({action:'auth.sign_in_denied',outcome:'denied',targetType:'email',context:readAdminAuditContext(request.headers)});} catch { /* Never authorize without required audit. */ }
   try {await auth?.auth.signOut({scope:'local'});} catch { /* Clear only administrative cookies. */ }
   await clearAdminAuthCookies();
  }
  return redirect(true);
 }
}
