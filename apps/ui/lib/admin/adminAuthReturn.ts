import 'server-only';
import { cookies } from 'next/headers';
import { reportReturnPath } from './reportReturn';
const NAME='2000nl-admin-return';
const options=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'});
/** This cookie carries navigation only; actual permissions are rechecked after sign-in. */
export async function storeAdminReturn(value:unknown,origin:string) {
 const target=typeof value==='string'?reportReturnPath(value,origin,['feedback.read','notifications.manage']):null;
 const store=await cookies();store.set(NAME,target??'',{...options(),maxAge:target?3600:0});
}
export async function consumeAdminReturnUrl(origin:string) {
 try {
  const store=await cookies();const value=store.getAll().find(cookie=>cookie.name===NAME)?.value;
  store.set(NAME,'',{...options(),maxAge:0});
  const target=reportReturnPath(value??null,origin,['feedback.read','notifications.manage']);
  return target?'/admin?'+new URLSearchParams({returnTo:target}).toString():'/admin';
 } catch { return '/admin'; }
}
