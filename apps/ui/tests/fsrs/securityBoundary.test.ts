import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { getDbUrl, runMigrations, ensureUserWithSettings, withTransaction } from './dbTestUtils';
const url=getDbUrl();
const suite=url?describe:describe.skip;
async function actor(c:PoolClient,user:string,session:string) {
 await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated',session_id:session})]);
 await c.query('set local role authenticated');
}
async function fixture(c:PoolClient) {
 const user=randomUUID(),session=randomUUID(); await ensureUserWithSettings(c,user);
 await c.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[session,user]);
 return {user,session};
}
async function rejected(c:PoolClient,sql:string,args:unknown[]=[]) {
 await c.query('savepoint reject');
 await expect(c.query(sql,args)).rejects.toMatchObject({code:'42501'});
 await c.query('rollback to savepoint reject');
}
suite('session boundary and server-owned tier',()=>{
 const pool=new Pool({connectionString:url}); beforeAll(()=>runMigrations(pool),120000); afterAll(()=>pool.end());
 test('real authenticated role may update preferences but cannot UPDATE, INSERT or reinsert a privileged tier',()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await actor(c,f.user,f.session);
  await c.query('select public.admission_enforce()');
  expect((await c.query('select public.check_first_party_session_v1() value')).rows[0].value).toBe(true);
  await c.query("update user_settings set translation_lang='en' where user_id=$1",[f.user]);
  expect((await c.query("select has_column_privilege('authenticated','public.user_settings','subscription_tier','UPDATE') value")).rows[0].value).toBe(false);
  await rejected(c,"update user_settings set subscription_tier='admin' where user_id=$1",[f.user]);
  await rejected(c,'delete from user_settings where user_id=$1',[f.user]);
  await c.query('reset role');await c.query('delete from user_settings where user_id=$1',[f.user]);await actor(c,f.user,f.session);
  await rejected(c,"insert into user_settings(user_id,subscription_tier) values($1,'premium')",[f.user]);
  await c.query('insert into user_settings(user_id) values($1)',[f.user]);
  expect((await c.query('select subscription_tier from user_settings where user_id=$1',[f.user])).rows[0].subscription_tier).toBe('free');
  await rejected(c,'truncate user_settings');
  await rejected(c,'select * from connected_client_sessions');
 }));
 test('column ACL cannot be bypassed by a definer write and trusted service can still set tier',()=>withTransaction(pool,async c=>{
  const f=await fixture(c);
  await c.query(`create function public.security_test_tier(u uuid) returns void language sql security definer set search_path=pg_catalog as $$ update public.user_settings set subscription_tier='admin' where user_id=u $$`);
  await actor(c,f.user,f.session);await rejected(c,'select public.security_test_tier($1)',[f.user]);
  await c.query('reset role');await c.query('set local role service_role');
  await c.query("update user_settings set subscription_tier='premium' where user_id=$1",[f.user]);
  expect((await c.query('select subscription_tier from user_settings where user_id=$1',[f.user])).rows[0].subscription_tier).toBe('premium');
  await c.query('reset role');
  await c.query(`create function public.security_test_delete(u uuid) returns void language sql security definer set search_path=pg_catalog as $$ delete from public.user_settings where user_id=u $$`);
  await actor(c,f.user,f.session);await rejected(c,'select public.security_test_delete($1)',[f.user]);
  await rejected(c,'delete from user_settings where user_id=$1',[f.user]);
  expect((await c.query('select subscription_tier from user_settings where user_id=$1',[f.user])).rows[0].subscription_tier).toBe('premium');
  await c.query('reset role');await c.query('delete from auth.users where id=$1',[f.user]);
  expect((await c.query('select * from user_settings where user_id=$1',[f.user])).rowCount).toBe(0);
 }));
 test('pre-cutover, missing, wrong-user and deleted auth sessions fail even with a fresh JWT iat',()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query("update auth.sessions set created_at='2000-01-01' where id=$1",[f.session]);await actor(c,f.user,f.session);
  await rejected(c,'select public.admission_enforce()');
  expect((await c.query('select public.check_first_party_session_v1() value')).rows[0].value).toBe(false);
  await c.query('reset role');await c.query('update auth.sessions set created_at=clock_timestamp() where id=$1',[f.session]);
  await actor(c,f.user,randomUUID());await rejected(c,'select public.admission_enforce()');
  await actor(c,randomUUID(),f.session);await rejected(c,'select public.admission_enforce()');
  await c.query('reset role');await c.query('delete from auth.sessions where id=$1',[f.session]);
  await actor(c,f.user,f.session);await rejected(c,'select public.admission_enforce()');
 }));
 test('bound provider JWT requires server proof, never qualifies as first-party, and respects grant/session revoke',()=>withTransaction(pool,async c=>{
  const f=await fixture(c),client='security-'+randomUUID(),connection=randomUUID();
  await c.query("insert into connected_clients(client_id,display_name,client_type,allowed_redirect_uris,allowed_scopes) values($1,'fixture','chrome_extension',array['https://example.invalid'],array['platform:read'])",[client]);
  await c.query("insert into connected_client_grants(client_id,user_id,scopes) values($1,$2,array['platform:read'])",[client,f.user]);
  await c.query(`insert into connected_client_sessions(id,client_id,user_id,scopes,access_token_hash,access_token_expires_at,refresh_token_hash,credential_version,auth_session_id,provider_session_ciphertext,backend_proof_hash,refresh_token_expires_at,refresh_token_family_hashes,grant_revision)
   values($1,$2,$3,array['platform:read'],'access',now()+interval '1 hour',$1::uuid::text,2,$4,'cipher',encode(sha256(convert_to('server-proof','UTF8')),'hex'),now()+interval '1 day',array['refresh'],(select authority_revision from connected_client_grants where client_id=$2 and user_id=$3))`,[connection,client,f.user,f.session]);
  await actor(c,f.user,f.session);await rejected(c,'select public.admission_enforce()');
  await c.query(`select set_config('request.headers','{"x-connect-backend-proof":"server-proof"}',true)`);
  await c.query('select public.admission_enforce()');
  expect((await c.query('select public.check_first_party_session_v1() value')).rows[0].value).toBe(false);
  await c.query('reset role');await c.query('update connected_client_grants set revoked_at=now() where client_id=$1',[client]);
  await actor(c,f.user,f.session);await rejected(c,'select public.admission_enforce()');
 }));
});
