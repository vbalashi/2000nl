import 'server-only';
import { NextResponse } from 'next/server';
import { createAdminAuthClient } from '@/lib/admin/adminServerClient';
import { adminEmailEnabled,adminAuthOrigin,adminAuthSameOrigin,adminEmail,adminAuthInput } from '@/lib/admin/adminEmailAuth';
import { storeAdminReturn } from '@/lib/admin/adminAuthReturn';
import { readAdminAuditContext,writeAdminAuditEvent } from '@/lib/admin/adminAuditRepository';
export const dynamic='force-dynamic';
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
export async function GET() { return respond({enabled:adminEmailEnabled()}); }
export async function POST(request: Request) {
 if(!adminAuthSameOrigin(request))return respond({error:'request_rejected'},403);
 if(!adminEmailEnabled())return respond({error:'unavailable'},503);
 let email:string|null;let returnTo:unknown;
 try {const input=await adminAuthInput(request);email=adminEmail(input?.email);if(!email || Object.keys(input).some(key=>!['email','returnTo'].includes(key)))throw new Error();returnTo=input.returnTo;}
 catch {return respond({error:'invalid_request'},400);}
 try {
  const auth=await createAdminAuthClient();
  const {error:sendError}=await auth.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:new URL('/api/admin/auth/email/callback',adminAuthOrigin(request)!).href}});
  if(sendError)await writeAdminAuditEvent({action:'auth.sign_in_denied',outcome:'failure',targetType:'email',context:readAdminAuditContext(request.headers)});
  await storeAdminReturn(returnTo,adminAuthOrigin(request)!);
  return respond({accepted:true});
 } catch {return respond({error:'unavailable'},503);}
}
