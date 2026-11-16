import 'server-only';
import { NextResponse } from 'next/server';
import { createAdminAuthClient,createAdminServiceClient } from '@/lib/admin/adminServerClient';
import { adminEmailEnabled,adminAuthSameOrigin,adminEmail,adminAuthInput } from '@/lib/admin/adminEmailAuth';
import { readAdminAuditContext,writeAdminAuditEvent } from '@/lib/admin/adminAuditRepository';
export const dynamic='force-dynamic';
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
export async function GET() { return respond({enabled:adminEmailEnabled()}); }
export async function POST(request: Request) {
 if(!adminAuthSameOrigin(request))return respond({error:'request_rejected'},403);
 if(!adminEmailEnabled())return respond({error:'unavailable'},503);
 let email:string|null;
 try {const input=await adminAuthInput(request);email=adminEmail(input?.email);if(!email || Object.keys(input).length!==1)throw new Error();}
 catch {return respond({error:'invalid_request'},400);}
 try {
  const {data:operator,error}=await createAdminServiceClient().from('admin_operators').select('email,user_id,is_active').eq('email',email).maybeSingle();
  if(error)throw new Error();
  if(!operator?.is_active) {
   await writeAdminAuditEvent({action:'auth.sign_in_denied',outcome:'denied',targetType:'email',context:readAdminAuditContext(request.headers)});
   return respond({accepted:true}); // Do not reveal which addresses are operators.
  }
  const auth=await createAdminAuthClient();
  const {error:sendError}=await auth.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
  if(sendError)await writeAdminAuditEvent({action:'auth.sign_in_denied',outcome:'failure',targetType:'email',context:readAdminAuditContext(request.headers)});
  return respond({accepted:true});
 } catch {return respond({error:'unavailable'},503);}
}
