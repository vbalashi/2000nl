import 'server-only';
import { cookies } from 'next/headers';
import { adminConsolePermissions, adminReturnPath } from './consoleRoutes';
import { hasUnifiedAdminArtifact } from './unifiedArtifact';
const NAME='2000nl-admin-return';
const options=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'});
const understoodPermissions = Object.values(adminConsolePermissions);
/** This cookie carries navigation only; actual permissions are rechecked after sign-in. */
export async function storeAdminReturn(value:unknown,origin:string) {
 const target=typeof value==='string'?adminReturnPath(value,origin,understoodPermissions,await hasUnifiedAdminArtifact()):null;
 const store=await cookies();store.set(NAME,target??'',{...options(),maxAge:target?3600:0});
}
export async function consumeAdminReturnUrl(origin:string) {
 try {
  const store=await cookies();const value=store.getAll().find(cookie=>cookie.name===NAME)?.value;
  store.set(NAME,'',{...options(),maxAge:0});
  const target=adminReturnPath(value??null,origin,understoodPermissions,await hasUnifiedAdminArtifact());
  return target?'/admin?'+new URLSearchParams({returnTo:target}).toString():'/admin';
 } catch { return '/admin'; }
}
