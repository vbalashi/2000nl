import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDbUrl, runMigrations, ensureUserWithSettings, withTransaction } from "./dbTestUtils";
const url = getDbUrl();
(url ? describe : describe.skip)("product admission gates", () => {
 const pool = new Pool({ connectionString: url });
 beforeAll(() => runMigrations(pool)); afterAll(() => pool.end());
 test("both complete postflight chains retain existing checks and verify new fences", async () => {
  function expand(file: string): string { return fs.readFileSync(path.resolve(process.cwd(), "../..", file), "utf8").replace(/^\\i (.+)$/gm, (_, child: string) => expand(child.trim())); }
  await pool.query(expand("db/deploy-contract/postflight-286.sql"));
  await pool.query(expand("db/deploy-contract/read-only-postflight-286.sql"));
 });
 test("confirmed request, explicit approval, revoke, mode preservation, audit and unauthorized operator", async () => {
  await withTransaction(pool, async c => {
   const user = randomUUID(), operator = randomUUID(), email = `admission-${randomUUID()}@example.test`;
   await ensureUserWithSettings(c, user); await ensureUserWithSettings(c, operator);
   await c.query("update auth.users set email=$2,email_confirmed_at=now() where id=$1", [user,email]);
   await c.query("insert into admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['users.read','admission.manage'])", [`operator-${operator}@example.test`,operator]);
   await c.query("update private.admission_control set enabled=true,mode='approval-required'");
   await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:user,role:'authenticated'})]);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
   expect((await c.query("select admission_request() s")).rows[0].s.status).toBe('pending');
   expect((await c.query("select private.admission_allowed($1) ok",[user])).rows[0].ok).toBe(false);
   const mutate = async (action: string, emails: string[] = [email], mode: string | null = null) => (await c.query("select admin_admission_mutate($1,$2,$3,$4,$5) r",[operator,action,emails,mode,randomUUID()])).rows[0].r;
   expect((await mutate('approve')).results[0].outcome).toBe('changed');
   expect((await mutate('approve')).results[0].outcome).toBe('unchanged');
   await mutate('mode',[],'invite-only');
   expect((await c.query("select private.admission_allowed($1) ok",[user])).rows[0].ok).toBe(true);
   expect((await mutate('reject')).results[0].outcome).toBe('unchanged');
   await mutate('revoke'); await mutate('mode',[],'open');
   expect((await c.query("select admission_request() s")).rows[0].s.status).toBe('revoked');
   expect((await c.query("select private.admission_allowed($1) ok",[user])).rows[0].ok).toBe(false);
   expect((await c.query("select count(*)::int n from admin_audit_events where operator_user_id=$1 and action='admission.approve'",[operator])).rows[0].n).toBe(1);
  });
 });
 test("open mode admits pending verified requests, retains rejection, and protects future client tables", async () => {
  await withTransaction(pool, async c => {
   const user=randomUUID(), email=`pending-${randomUUID()}@example.test`; await ensureUserWithSettings(c,user);
   await c.query("update auth.users set email=$2,email_confirmed_at=now() where id=$1",[user,email]);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
   await c.query("update private.admission_control set enabled=true,mode='approval-required'");
   expect((await c.query("select admission_request() s")).rows[0].s.status).toBe('pending');
   await c.query("update private.admission_control set mode='open'");
   expect((await c.query("select admission_request() s")).rows[0].s.status).toBe('approved');
   await c.query("update private.admission_requests set status='rejected' where email=$1",[email]);
   expect((await c.query("select admission_request() s")).rows[0].s.status).toBe('rejected');
   await c.query("create table public.admission_future_fixture(user_id uuid); alter table public.admission_future_fixture enable row level security; create policy own on public.admission_future_fixture for select to authenticated using(user_id=auth.uid()); grant select on public.admission_future_fixture to authenticated");
   expect((await c.query("select count(*)::int n from pg_policy where polrelid='public.admission_future_fixture'::regclass and polname='product_admission_fence' and not polpermissive")).rows[0].n).toBe(1);
   await c.query("insert into public.admission_future_fixture values($1)",[user]);
   await c.query("set local role authenticated");
   expect((await c.query("select count(*)::int n from public.admission_future_fixture")).rows[0].n).toBe(0);
   await c.query("reset role");
  });
 });
 test("unconfirmed/wrong email cannot claim invitation; unauthorized RPC and RLS are blocked", async () => {
  await withTransaction(pool, async c => {
   const user=randomUUID(); await ensureUserWithSettings(c,user);
   await c.query("update auth.users set email='other@example.test',email_confirmed_at=null where id=$1",[user]);
   await c.query("update private.admission_control set enabled=true");
   await c.query("insert into private.admission_requests(email,status) values('invited@example.test','approved')");
   await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,role:'authenticated'})]);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
   expect((await c.query("select admission_request() s")).rows[0].s.status).toBe('unconfirmed');
   await c.query("update auth.users set email_confirmed_at=now() where id=$1",[user]);
   expect((await c.query("select admission_request() s")).rows[0].s.status).toBe('pending');
   await c.query("set local role authenticated");
   expect((await c.query("select count(*)::int n from public.user_settings")).rows[0].n).toBe(0);
   await c.query("savepoint denied");
   await expect(c.query("select admin_admission_mutate($1,'approve',ARRAY['other@example.test'],null,$2)",[user,randomUUID()])).rejects.toThrow();
   await c.query("rollback to savepoint denied");
   await c.query("select set_config('request.path','/rpc/some_product_rpc',true)");
   await c.query("savepoint denied_hook");await expect(c.query("select admission_enforce()")).rejects.toThrow('admission_required');await c.query("rollback to savepoint denied_hook");
   await c.query("select set_config('request.path','/rpc/admission_request',true)");await c.query("select admission_enforce()");
   await c.query("reset role");
  });
 });
 test("approved product users retain sharing authority while product revocation fences raw access without deleting membership", async () => {
  await withTransaction(pool, async c => {
   const owner=randomUUID(), viewer=randomUUID();
   for (const id of [owner,viewer]) {
    await ensureUserWithSettings(c,id);
    const email=`combined-${id}@example.test`;
    await c.query("update auth.users set email=$2,email_confirmed_at=now() where id=$1",[id,email]);
    await c.query("insert into private.admission_requests(email,status) values($1,'approved')",[email]);
   }
   await c.query("update private.admission_control set enabled=true,mode='invite-only'; update private.collection_sharing_rollout set new_writes_enabled=true");
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword:randomUUID(),languageCode:'nl',definition:'shared admission lesson'}])).rows[0].id;
   const collection=(await c.query("insert into user_word_lists(user_id,name,language_code) values($1,'Combined lesson','nl') returning id",[owner])).rows[0].id;
   await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[collection,entry]);
   await c.query("set local role authenticated");
   await c.query("select set_config('request.path','/rpc/command_collection_share_v1',true); select admission_enforce()");
   const opened=(await c.query("select command_collection_share_v1($1,'open',$2,0) r",[randomUUID(),collection])).rows[0].r;
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);
   await c.query("select admission_enforce()");
   await c.query("select command_collection_share_v1($1,'accept',null,null,$2)",[randomUUID(),opened.invitationCode]);
   expect((await c.query("select get_word_list_summary($1,$2,'user') r",[viewer,collection])).rows[0].r).toMatchObject({ownership:'received'});
   expect((await c.query("select count(*)::int n from user_settings where user_id=$1",[viewer])).rows[0].n).toBe(1);
   await c.query("reset role");
   await c.query("update private.admission_requests set status='revoked' where email=$1",[`combined-${viewer}@example.test`]);
   await c.query("set local role authenticated; savepoint revoked_product");
   await expect(c.query("select admission_enforce()")).rejects.toThrow('admission_required');
   await c.query("rollback to savepoint revoked_product");
   expect((await c.query("select count(*)::int n from user_settings where user_id=$1",[viewer])).rows[0].n).toBe(0);
   await c.query("reset role");
   expect((await c.query("select count(*)::int n from private.collection_sharing_subscriptions where user_id=$1 and is_active",[viewer])).rows[0].n).toBe(1);
  });
 });

});
