// @vitest-environment node
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { beforeAll, afterAll, describe, expect, test, vi } from 'vitest';
import { getDbUrl, runMigrations } from '../fsrs/dbTestUtils';
import { POST as approve } from '@/app/api/connect/authorize/approve/route';
import { POST as token } from '@/app/api/connect/token/route';
import { POST as admissionRequest } from '@/app/api/admission/route';
import { POST as revoke } from '@/app/api/connect/revoke/route';
import { GET as sessionRoute } from '@/app/api/platform/session/route';
import { POST as actionRoute } from '@/app/api/platform/actions/route';
import { decryptProviderSession, verifiedSessionId } from '@/lib/connect/sessionCredentials';
import { resetPlatformAuthCacheForTests } from '@/lib/platform/serverSupabase';

// Explicit opt-in: these tests create only synthetic users in a dedicated local
// GoTrue/PostgREST stack. They never infer a target from application credentials.
const target=process.env.CONNECT_SECURITY_TEST_URL;
if(target && !/^http:\/\/127\.0\.0\.1:\d+$/.test(target)) throw new Error('unsafe_connect_test_url');
const db=getDbUrl();const enabled=!!target&&!!db;
const suite=enabled?describe:describe.skip;
const signingSecret='audit68-local-only-jwt-secret-never-for-deployment';
function jwt(role:string){const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');const body=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200});return body+'.'+crypto.createHmac('sha256',signingSecret).update(body).digest('base64url');}
const request=(route:string,bearer:string,body?:unknown)=>new NextRequest('http://localhost'+route,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
type Credentials={access_token:string;refresh_token:string;expires_at:number};
suite('real GoTrue and PostgREST Connect boundary',()=>{
 const pool=new Pool({connectionString:db});let admin:SupabaseClient;let first:Session;let clientId:string;const users:string[]=[];
 beforeAll(async()=>{
  await runMigrations(pool);
  Object.assign(process.env,{SUPABASE_URL:target,SUPABASE_ANON_KEY:jwt('anon'),SUPABASE_SERVICE_ROLE_KEY:jwt('service_role'),CONNECT_SESSION_ENCRYPTION_KEY:Buffer.alloc(32,68).toString('base64'),ADMISSION_REQUIRED:'false',PLATFORM_AUTH_CACHE_IN_TESTS:'1'});
  resetPlatformAuthCacheForTests();
  admin=createClient(target!,jwt('service_role'),{auth:{persistSession:false,autoRefreshToken:false}});
  first=await newUser();clientId='security-'+crypto.randomUUID();
  await pool.query("insert into connected_clients(client_id,display_name,client_type,allowed_redirect_uris,allowed_scopes,requires_pkce) values($1,'Fixture','chrome_extension',array['https://example.invalid/callback'],array['platform:read','platform:write','offline_access'],true)",[clientId]);
 },120000);
 afterAll(async()=>{if(clientId)await pool.query('delete from connected_clients where client_id=$1',[clientId]);for(const id of users)await admin.auth.admin.deleteUser(id);await pool.end();resetPlatformAuthCacheForTests();});
 async function newUser(){const email=crypto.randomUUID()+'@example.test',password=crypto.randomUUID();const made=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(made.error).toBeNull();users.push(made.data.user!.id);const browser=createClient(target!,jwt('anon'),{auth:{persistSession:false,autoRefreshToken:false}});const signed=await browser.auth.signInWithPassword({email,password});expect(signed.error).toBeNull();return signed.data.session!;}
 async function authorization(scopes='platform:read') {
  const verifier=crypto.randomBytes(32).toString('base64url');
  const allowed=await approve(request('/api/connect/authorize/approve',first.access_token,{clientId,redirectUri:'https://example.invalid/callback',scope:scopes,codeChallenge:crypto.createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256'}));
  expect(allowed.status).toBe(200);const code=new URL((await allowed.json()).redirectTo).searchParams.get('code');
  return {grant_type:'authorization_code',client_id:clientId,code,redirect_uri:'https://example.invalid/callback',code_verifier:verifier};
 }
 async function credentials(scopes='platform:read') {
  const exchanged=await token(request('/api/connect/token','',await authorization(scopes)));
  expect(exchanged.status).toBe(200);return await exchanged.json() as Credentials;
 }
 const refresh=(value:Credentials)=>token(request('/api/connect/token','',{grant_type:'refresh_token',client_id:clientId,refresh_token:value.refresh_token}));
 const dataApi=(bearer:string,path:string,method='GET',body?:unknown)=>fetch(target+'/rest/v1/'+path,{method,headers:{apikey:jwt('anon'),authorization:'Bearer '+bearer,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 async function provider(value:Credentials){const row=(await pool.query('select * from connected_client_sessions where access_token_hash=$1',[crypto.createHash('sha256').update(value.access_token).digest('hex')])).rows[0];return {row,...decryptProviderSession(row.provider_session_ciphertext,row.id)};}
 test('first-party succeeds; read-only client reads but cannot mutate, consent, or use Data API',async()=>{
  expect((await sessionRoute(request('/api/platform/session',first.access_token))).status).toBe(200);
  const connected=await credentials();expect(connected.access_token).toMatch(/^nlc_a2_/);expect(connected.refresh_token).toMatch(/^nlc_r2_/);
  expect((await sessionRoute(request('/api/platform/session',connected.access_token))).status).toBe(200);
  expect((await actionRoute(request('/api/platform/actions',connected.access_token,{action:'create-user-list',name:'no'}))).status).toBe(403);
  expect((await approve(request('/api/connect/authorize/approve',connected.access_token,{clientId,scope:'platform:write'}))).status).toBe(403);
  expect((await dataApi(connected.access_token,'user_settings')).status).toBe(401);
  const internal=await provider(connected);expect((await admin.auth.getUser(internal.session.access_token)).error).toBeNull();
  expect(JSON.stringify(connected)).not.toContain(internal.session.access_token);expect(JSON.stringify(connected)).not.toContain(internal.session.refresh_token);
  expect((await dataApi(internal.session.access_token,'user_settings')).status).toBe(403);
  expect((await dataApi(internal.session.access_token,'rpc/add_entry_to_user_list','POST',{p_user_id:first.user.id,p_list_id:crypto.randomUUID(),p_entry_id:crypto.randomUUID()})).status).toBe(403);
  expect((await approve(request('/api/connect/authorize/approve',internal.session.access_token,{clientId,scope:'platform:write'}))).status).toBe(401);
 });
 test('concurrent refresh has one winner; old tokens never become first-party and provider session_id stays stable',async()=>{
  const previous=await credentials(),internal=await provider(previous);
  const results=await Promise.all([refresh(previous),refresh(previous)]);expect(results.map(r=>r.status).sort()).toEqual([200,401]);
  const next=await results.find(r=>r.status===200)!.json() as Credentials;
  expect((await sessionRoute(request('/api/platform/session',previous.access_token))).status).toBe(401);
  expect((await sessionRoute(request('/api/platform/session',next.access_token))).status).toBe(200);
  const newer=await provider(next);expect(newer.row.auth_session_id).toBe(internal.row.auth_session_id);
  expect((await admin.auth.getUser(internal.session.access_token)).error).toBeNull();
  expect((await dataApi(internal.session.access_token,'user_settings')).status).toBe(403);
  expect((await approve(request('/api/connect/authorize/approve',next.access_token,{clientId,scope:'platform:write'}))).status).toBe(403);
  expect((await revoke(request('/api/connect/revoke','',{client_id:clientId,refresh_token:previous.refresh_token}))).status).toBe(200);
  expect((await sessionRoute(request('/api/platform/session',next.access_token))).status).toBe(401);
 });
 test('revoke closes subsequent reads, refresh and consent, while the first-party session remains valid',async()=>{
  const connected=await credentials();expect((await revoke(request('/api/connect/revoke','',{client_id:clientId,refresh_token:connected.refresh_token}))).status).toBe(200);
  expect((await sessionRoute(request('/api/platform/session',connected.access_token))).status).toBe(401);
  expect((await refresh(connected)).status).toBe(401);
  expect((await approve(request('/api/connect/authorize/approve',connected.access_token,{clientId,scope:'platform:write'}))).status).toBe(403);
  expect((await sessionRoute(request('/api/platform/session',first.access_token))).status).toBe(200);
 });
 test('pre-boundary provider session is rejected by both app and Data API after a real provider refresh',async()=>{
  const old=await newUser();await pool.query("update auth.sessions set created_at='2000-01-01' where id=$1",[verifiedSessionId(old.access_token)]);
  const browser=createClient(target!,jwt('anon'),{auth:{persistSession:false,autoRefreshToken:false}});
  const rotated=await browser.auth.refreshSession({refresh_token:old.refresh_token});expect(rotated.error).toBeNull();
  expect(verifiedSessionId(rotated.data.session!.access_token)).toBe(verifiedSessionId(old.access_token));
  expect((await sessionRoute(request('/api/platform/session',rotated.data.session!.access_token))).status).toBe(401);
  expect((await dataApi(rotated.data.session!.access_token,'user_settings')).status).toBe(403);
 });
 test('tier mutation is denied at actual PostgREST while ordinary preferences still work',async()=>{
  const filter='user_settings?user_id=eq.'+first.user.id;
  expect((await dataApi(first.access_token,filter,'PATCH',{subscription_tier:'admin'})).status).toBe(403);
  expect((await dataApi(first.access_token,filter,'PATCH',{translation_lang:'en'})).status).toBe(204);
  await pool.query("update user_settings set subscription_tier='premium' where user_id=$1",[first.user.id]);
  expect((await dataApi(first.access_token,filter,'DELETE')).status).toBe(403);
  expect((await pool.query('select subscription_tier from user_settings where user_id=$1',[first.user.id])).rows[0].subscription_tier).toBe('premium');
 });
 test('first-party and explicitly writable connected sessions retain ordinary mutations',async()=>{
  for(const bearer of [first.access_token,(await credentials('platform:read platform:write')).access_token]) {
   const result=await actionRoute(request('/api/platform/actions',bearer,{action:'create-user-list',name:'Security fixture '+crypto.randomUUID(),languageCode:'nl'}));
   expect(result.status).toBe(200);expect(await result.json()).toMatchObject({ok:true,action:'create-user-list'});
  }
 });
 test('lost provider refresh response consumes the lease without disclosing credentials',async()=>{
  const prior=await credentials(),original=globalThis.fetch;let intercepted=false;
  const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
   const response=await original(input,init);
   if(String(input).includes('/auth/v1/token?grant_type=refresh_token')) {intercepted=true;return new Response(JSON.stringify({error:'invalid_grant'}),{status:400,headers:{'content-type':'application/json'}});}
   return response;
  });
  try{const result=await refresh(prior);expect(intercepted).toBe(true);expect(result.status).toBe(401);expect(await result.json()).toEqual({error:'invalid_refresh_token'});}
  finally{spy.mockRestore();}
  expect((await refresh(prior)).status).toBe(401);
  expect((await sessionRoute(request('/api/platform/session',prior.access_token))).status).toBe(401);
 });
 test('consent cannot issue a code under a revoke/regrant lifetime created after its upsert',async()=>{
  const before=Number((await pool.query('select count(*) n from connect_authorization_codes where client_id=$1',[clientId])).rows[0].n);
  const original=globalThis.fetch;let consentRevision:string|undefined;let replacementRevision:string|undefined;
  const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
   const response=await original(input,init);
   if(!consentRevision && String(input).includes('/rest/v1/connected_client_grants') && init?.method==='POST') {
    expect(response.ok).toBe(true);
    const returned=await response.clone().json();consentRevision=(Array.isArray(returned)?returned[0]:returned).authority_revision;
    await pool.query('update connected_client_grants set revoked_at=clock_timestamp() where client_id=$1',[clientId]);
    replacementRevision=(await pool.query('update connected_client_grants set revoked_at=null where client_id=$1 returning authority_revision',[clientId])).rows[0].authority_revision;
   }
   return response;
  });
  try {
   const response=await approve(request('/api/connect/authorize/approve',first.access_token,{clientId,redirectUri:'https://example.invalid/callback',scope:'platform:read',codeChallenge:crypto.randomBytes(32).toString('base64url'),codeChallengeMethod:'S256'}));
   expect(consentRevision).toBeTruthy();expect(replacementRevision).not.toBe(consentRevision);
   expect(response.status).toBe(500);expect(await response.json()).toMatchObject({error:'authorization_code_save_failed'});
   expect(Number((await pool.query('select count(*) n from connect_authorization_codes where client_id=$1',[clientId])).rows[0].n)).toBe(before);
  } finally {spy.mockRestore();}
  // A fresh explicit consent still returns a usable code.
  expect((await token(request('/api/connect/token','',await authorization()))).status).toBe(200);
 });
 test('old code and old session cannot regain authority after revoke and new consent',async()=>{
  const connected=await credentials(),oldCode=await authorization();
  await pool.query('update connected_client_grants set revoked_at=clock_timestamp() where client_id=$1',[clientId]);
  const fresh=await authorization();
  expect((await token(request('/api/connect/token','',oldCode))).status).toBe(401);
  expect((await token(request('/api/connect/token','',fresh))).status).toBe(200);
  expect((await sessionRoute(request('/api/platform/session',connected.access_token))).status).toBe(401);
  expect((await refresh(connected)).status).toBe(401);
 });
 test('grant revoked during actual provider issuance or refresh cannot create live authority',async()=>{
  for(const mode of ['issue','refresh']) {
   const code=mode==='issue'?await authorization():null;
   const prior=mode==='refresh'?await credentials():null;
   const original=globalThis.fetch;let intercepted=false;
   const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const response=await original(input,init),url=String(input);
    if(!intercepted && ((mode==='issue'&&url.includes('/auth/v1/verify')) || (mode==='refresh'&&url.includes('/auth/v1/token?grant_type=refresh_token')))) {
     intercepted=true;await pool.query('update connected_client_grants set revoked_at=clock_timestamp() where client_id=$1',[clientId]);
    }
    return response;
   });
   try {const response=prior?await refresh(prior):await token(request('/api/connect/token','',code));
    expect(intercepted).toBe(true);expect(response.status).toBeGreaterThanOrEqual(400);
    const body=await response.json();expect(body).not.toHaveProperty('access_token');expect(body).not.toHaveProperty('refresh_token');
   } finally {spy.mockRestore();}
   if(prior)expect((await sessionRoute(request('/api/platform/session',prior.access_token))).status).toBe(401);
  }
 });
 test('ambiguous session persistence failure never returns provider or external credentials',async()=>{
  const code=await authorization(),original=globalThis.fetch;let intercepted=false;
  const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
   const response=await original(input,init);
   if(String(input).includes('/rest/v1/connected_client_sessions') && init?.method==='POST') {
    intercepted=true;return new Response(JSON.stringify({message:'fixture lost reply after commit'}),{status:503,headers:{'content-type':'application/json'}});
   }return response;
  });
  try {const response=await token(request('/api/connect/token','',code));expect(intercepted).toBe(true);expect(response.status).toBe(503);
   expect(await response.json()).toEqual({error:'session_record_failed'});
   expect((await token(request('/api/connect/token','',code))).status).toBe(400);
  }finally{spy.mockRestore();}
 });
 test('pending users can request admission while normal API access remains denied',async()=>{
  const pending=await newUser();process.env.ADMISSION_REQUIRED='true';
  await pool.query("update private.admission_control set enabled=true,mode='approval-required'");
  try {
   const response=await admissionRequest(request('/api/admission',pending.access_token,{}));
   expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:'pending'});
   expect((await sessionRoute(request('/api/platform/session',pending.access_token))).status).toBe(403);
  }finally{process.env.ADMISSION_REQUIRED='false';await pool.query("update private.admission_control set enabled=false,mode='open'");}
 });
 test('cached first-party requests still check live session authority and record local latency',async()=>{
  const timings:number[]=[];
  for(let n=0;n<20;n++){const start=performance.now();expect((await sessionRoute(request('/api/platform/session',first.access_token))).status).toBe(200);timings.push(performance.now()-start);}
  timings.sort((a,b)=>a-b);console.info('LOCAL_SESSION_ROUTE_MS',JSON.stringify({median:timings[10],p95:timings[18],samples:20}));
  const disposable=await newUser();expect((await sessionRoute(request('/api/platform/session',disposable.access_token))).status).toBe(200);
  await pool.query('delete from auth.sessions where id=$1',[verifiedSessionId(disposable.access_token)]);
  expect((await sessionRoute(request('/api/platform/session',disposable.access_token))).status).toBe(401);
 });
},30000);
