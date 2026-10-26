import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const url = getDbUrl();
async function asUser(c: PoolClient, user: string) {
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
}
async function rejected(c: PoolClient, sql: string, args: unknown[], message: string) {
  await c.query("savepoint rejected_share_command");
  await expect(c.query(sql,args)).rejects.toMatchObject({ message });
  await c.query("rollback to savepoint rejected_share_command");
  await c.query("release savepoint rejected_share_command");
}
async function fixture(c: PoolClient) {
  const owner=randomUUID(), viewer=randomUUID(), second=randomUUID();
  for (const user of [owner,viewer,second]) await ensureUserWithSettings(c,user);
  await asUser(c,owner);
  const entry=(await c.query("select create_user_dictionary_entry($1,null,$2) id", [owner,
    {headword:"les",languageCode:"nl",definition:"a lesson"}])).rows[0].id;
  const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'lesson') returning id",[owner])).rows[0].id;
  await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,entry]);
  return {owner,viewer,second,entry,list};
}
const mutate = async (c:PoolClient, list:string, action:string, revision:number, operation=randomUUID()) =>
  (await c.query("select private.mutate_collection_share_v1($1,$2,$3,$4) result",[operation,action,list,revision])).rows[0].result;
const accept = async (c:PoolClient, code:string, operation=randomUUID()) =>
  (await c.query("select private.accept_collection_share_v1($1,$2) result",[operation,code])).rows[0].result;

(url ? describe : describe.skip)("private viewer lifecycle commands (no public rollout)",()=>{
  const pool=new Pool({connectionString:url});
  beforeAll(async()=>{
    await runMigrations(pool);
    // Retained Supabase242 grants these raw-table privileges; plain Postgres
    // does not. Exercise the actual RLS surface, not an accidental ACL denial.
    await pool.query("grant select,insert,update,delete on public.user_word_lists,public.user_word_list_items to authenticated");
  });
  afterAll(()=>pool.end());

  test("rotation preserves rights; close/reopen and old receipts never restore them",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      const openOperation=randomUUID();
      const opened=await mutate(c,f.list,"open",0,openOperation);
      expect(opened).toMatchObject({isOpen:true,revision:1,role:"owner",available:true});
      expect(opened.invitationCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(await mutate(c,f.list,"open",0,openOperation)).toEqual(opened);
      const lifetime=(await c.query("select access_lifetime from private.collection_sharing_roots where id=$1",[opened.rootId])).rows[0].access_lifetime;
      await asUser(c,f.viewer);
      expect((await c.query("select private.preview_collection_share_v1($1) result",[opened.invitationCode])).rows[0].result).toMatchObject({name:"lesson",available:false,entryCount:1});
      expect((await c.query("select count(*)::int n from private.collection_sharing_subscriptions where root_id=$1",[opened.rootId])).rows[0].n).toBe(0);
      await rejected(c,"select private.read_collection_share_owner_v1($1)",[f.list],"share_unavailable");
      expect((await c.query("select private.read_collection_share_receipt_v1($1) result",[openOperation])).rows[0].result).toMatchObject({status:"unknown"});
      const joinOperation=randomUUID();
      const joined=await accept(c,opened.invitationCode,joinOperation);
      expect(joined).toMatchObject({role:"viewer",available:true,collectionId:f.list});
      expect(joined).not.toHaveProperty("invitationCode");
      expect(await accept(c,opened.invitationCode,joinOperation)).toEqual(joined);
      await accept(c,opened.invitationCode);
      expect((await c.query("select count(*)::int n from private.collection_sharing_subscriptions where user_id=$1",[f.viewer])).rows[0].n).toBe(1);
      await asUser(c,f.owner);
      const rotated=await mutate(c,f.list,"rotate",1);
      expect(rotated.revision).toBe(2);
      expect(rotated.invitationCode).not.toBe(opened.invitationCode);
      expect((await c.query("select access_lifetime from private.collection_sharing_roots where id=$1",[opened.rootId])).rows[0].access_lifetime).toBe(lifetime);
      await asUser(c,f.second);
      await rejected(c,"select private.accept_collection_share_v1($1,$2)",[randomUUID(),opened.invitationCode],"share_unavailable");
      await asUser(c,f.viewer);
      expect((await accept(c,opened.invitationCode,joinOperation)).available).toBe(true);
      await asUser(c,f.owner);
      const closeOperation=randomUUID();
      expect(await mutate(c,f.list,"close",2,closeOperation)).toMatchObject({isOpen:false,revision:3,invitationCode:null});
      await asUser(c,f.viewer);
      expect((await accept(c,opened.invitationCode,joinOperation)).available).toBe(false);
      expect((await c.query("select private.read_collection_share_receipt_v1($1) result",[joinOperation])).rows[0].result).toMatchObject({status:"committed",available:false});
      await rejected(c,"select private.preview_collection_share_v1($1)",[rotated.invitationCode],"share_unavailable");
      expect((await c.query("select private.can_read_shared_author_entry_v1($1,$2) allowed",[f.viewer,f.entry])).rows[0].allowed).toBe(false);
      await asUser(c,f.owner);
      const reopened=await mutate(c,f.list,"open",3);
      expect(reopened).toMatchObject({isOpen:true,revision:4});
      expect(reopened.invitationCode).not.toBe(rotated.invitationCode);
      expect(await mutate(c,f.list,"close",2,closeOperation)).toMatchObject({isOpen:true,revision:4});
      await asUser(c,f.viewer);
      expect((await accept(c,opened.invitationCode,joinOperation)).available).toBe(false);
      expect((await accept(c,reopened.invitationCode)).available).toBe(true);
      expect((await c.query("select count(*)::int n from user_card_status where user_id=$1",[f.viewer])).rows[0].n).toBe(0);
      const facts=(await c.query("select response from private.collection_sharing_command_receipts where user_id=$1",[f.owner])).rows;
      expect(JSON.stringify(facts)).not.toContain(opened.invitationCode);
      expect(JSON.stringify(facts)).not.toContain("invitationCode");
    });
  });

  test("unsubscribe is account-local, replay does not rejoin, new explicit accept can",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c); const opened=await mutate(c,f.list,"open",0);
      await asUser(c,f.viewer); const join=randomUUID(); await accept(c,opened.invitationCode,join);
      await asUser(c,f.second); await accept(c,opened.invitationCode);
      await asUser(c,f.viewer);
      const operation=randomUUID();
      const unsubscribe=async()=> (await c.query("select private.unsubscribe_collection_share_v1($1,$2) result",[operation,f.list])).rows[0].result;
      expect(await unsubscribe()).toMatchObject({available:false});
      expect(await unsubscribe()).toMatchObject({available:false});
      expect((await accept(c,opened.invitationCode,join)).available).toBe(false);
      expect((await c.query("select private.can_read_shared_author_entry_v1($1,$2) allowed",[f.second,f.entry])).rows[0].allowed).toBe(true);
      expect((await c.query("select code from private.collection_sharing_invitations where root_id=$1 and role='viewer'",[opened.rootId])).rows[0].code).toBe(opened.invitationCode);
      expect((await accept(c,opened.invitationCode)).available).toBe(true);
    });
  });

  test("owner/source/revision and operation identity are checked before publication",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c);
      await asUser(c,f.second);
      await rejected(c,"select private.mutate_collection_share_v1($1,'open',$2,0)",[randomUUID(),f.list],"share_unavailable");
      const borrowed=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[f.second,{headword:"foreign",languageCode:"nl",definition:"foreign"}])).rows[0].id;
      await asUser(c,f.owner);
      await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[f.list,borrowed]);
      await rejected(c,"select private.mutate_collection_share_v1($1,'open',$2,0)",[randomUUID(),f.list],"share_copy_required");
      await c.query("delete from user_word_list_items where list_id=$1 and word_id=$2",[f.list,borrowed]);
      const operation=randomUUID(); await mutate(c,f.list,"open",0,operation);
      await rejected(c,"select private.mutate_collection_share_v1($1,'close',$2,0)",[operation,f.list],"share_operation_conflict");
      await rejected(c,"select private.mutate_collection_share_v1($1,'close',$2,0)",[randomUUID(),f.list],"share_revision_conflict");
      await rejected(c,"insert into user_word_list_items(list_id,word_id) values($1,$2)",[f.list,borrowed],"share_copy_required");
      await asUser(c,"");
      await rejected(c,"select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.list],"unauthorized");
    });
  });

  async function waitForLock(observer: PoolClient, blockedPid: number) {
    for(let attempt=0;attempt<100;attempt++) {
      await observer.query("select pg_stat_clear_snapshot()");
      if((await observer.query("select wait_event_type from pg_stat_activity where pid=$1",[blockedPid])).rows[0]?.wait_event_type==="Lock") return;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error("expected_share_transaction_lock");
  }
  async function cleanup(users: string[]) {
    await pool.query("delete from user_word_lists where user_id=any($1::uuid[])",[users]);
    await pool.query("delete from word_entries where dictionary_id in(select id from dictionaries where owner_user_id=any($1::uuid[]))",[users]);
    await pool.query("delete from auth.users where id=any($1::uuid[])",[users]);
  }

  test.each(["close-first","accept-first"])("accept/close linearize at the same root: %s",async order=>{
    const first=await pool.connect(), second=await pool.connect();
    let f:Awaited<ReturnType<typeof fixture>>|undefined;
    let pending:Promise<{ok:boolean;error?:string}>|undefined;
    try {
      await first.query("begin"); f=await fixture(first);
      const opened=await mutate(first,f.list,"open",0);
      await first.query("commit");
      await first.query("begin"); await second.query("begin");
      const pid=(await second.query("select pg_backend_pid() id")).rows[0].id;
      const operation=randomUUID();
      if(order==="close-first") {
        await asUser(first,f.owner); await mutate(first,f.list,"close",1);
        await asUser(second,f.viewer);
        pending=accept(second,opened.invitationCode,operation).then(()=>({ok:true}),e=>({ok:false,error:e.message}));
      } else {
        await asUser(first,f.viewer); await accept(first,opened.invitationCode,operation);
        await asUser(second,f.owner);
        pending=mutate(second,f.list,"close",1).then(()=>({ok:true}),e=>({ok:false,error:e.message}));
      }
      await waitForLock(first,pid);
      await first.query("commit");
      expect(await pending).toEqual(order==="close-first" ? {ok:false,error:"share_unavailable"} : {ok:true});
      await second.query(order==="close-first" ? "rollback" : "commit");
      expect((await first.query("select private.can_read_shared_author_entry_v1($1,$2) allowed",[f.viewer,f.entry])).rows[0].allowed).toBe(false);
      await first.query("begin"); await asUser(first,f.viewer);
      expect((await first.query("select private.read_collection_share_receipt_v1($1) result",[operation])).rows[0].result).toMatchObject(
        order==="close-first" ? {status:"unknown"} : {status:"committed",available:false});
      await first.query("rollback");
    } finally {
      await first.query("rollback"); if(pending) await pending;
      await second.query("rollback"); first.release(); second.release();
      if(f) await cleanup([f.owner,f.viewer,f.second]);
    }
  });

  test.each(["member-first","open-first"])("first publication and borrowed membership serialize: %s",async order=>{
    const first=await pool.connect(), second=await pool.connect();
    let f:Awaited<ReturnType<typeof fixture>>|undefined;
    let pending:Promise<{ok:boolean;error?:string}>|undefined;
    try {
      await first.query("begin"); f=await fixture(first);
      await asUser(first,f.second);
      const borrowed=(await first.query("select create_user_dictionary_entry($1,null,$2) id",[f.second,{headword:"borrowed race",languageCode:"nl",definition:"foreign"}])).rows[0].id;
      await first.query("commit");
      await first.query("begin"); await second.query("begin");
      await asUser(first,f.owner); await asUser(second,f.owner);
      const insert=(c:PoolClient)=>c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[f!.list,borrowed]);
      const pid=(await second.query("select pg_backend_pid() id")).rows[0].id;
      if(order==="member-first") {
        await insert(first);
        pending=mutate(second,f.list,"open",0).then(()=>({ok:true}),e=>({ok:false,error:e.message}));
      } else {
        await mutate(first,f.list,"open",0);
        pending=insert(second).then(()=>({ok:true}),e=>({ok:false,error:e.message}));
      }
      await waitForLock(first,pid); await first.query("commit");
      expect(await pending).toEqual({ok:false,error:"share_copy_required"});
      await second.query("rollback");
      expect((await first.query("select count(*)::int n from private.collection_sharing_roots where collection_id=$1 and is_open",[f.list])).rows[0].n).toBe(order==="open-first" ? 1 : 0);
    } finally {
      await first.query("rollback"); if(pending) await pending;
      await second.query("rollback"); first.release(); second.release();
      if(f) await cleanup([f.owner,f.viewer,f.second]);
    }
  });

  test("new command/read helpers stay closed to every API role",async()=>{
    const signatures=["collection_share_projection_v1(uuid,jsonb)","begin_collection_share_command_v1(uuid,jsonb)",
      "finish_collection_share_command_v1(uuid,jsonb,jsonb)","mutate_collection_share_v1(uuid,text,uuid,integer)",
      "accept_collection_share_v1(uuid,text)","unsubscribe_collection_share_v1(uuid,uuid)",
      "guard_shared_collection_member_source_v1()","read_collection_share_owner_v1(uuid)",
      "preview_collection_share_v1(text)","read_collection_share_receipt_v1(uuid)"];
    for(const role of ["anon","authenticated","service_role"]) for(const signature of signatures) {
      expect((await pool.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,`private.${signature}`])).rows[0].allowed).toBe(false);
    }
  });

  test("outsider direct INSERT cannot distinguish open, closed or unknown collections",async()=>{
    await withTransaction(pool,async c=>{
      const f=await fixture(c); await mutate(c,f.list,"open",0);
      const closed=(await c.query("insert into user_word_lists(user_id,name) values($1,'closed') returning id",[f.owner])).rows[0].id;
      await mutate(c,closed,"open",0); await mutate(c,closed,"close",1);
      await asUser(c,f.second);
      const ownEntry=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[f.second,{headword:"outsider source",languageCode:"nl",definition:"own"}])).rows[0].id;
      await c.query("set local role authenticated");
      for(const list of [f.list,closed,randomUUID()]) {
        await rejected(c,"insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,ownEntry],
          'new row violates row-level security policy for table "user_word_list_items"');
      }
    });
  });

  test("copy preparation refuses inverse member contention before direct deletion",async()=>{
    const copier=await pool.connect(), deleter=await pool.connect();
    let f:Awaited<ReturnType<typeof fixture>>|undefined;
    try {
      await copier.query("begin"); f=await fixture(copier); await mutate(copier,f.list,"open",0); await copier.query("commit");
      await copier.query("begin"); await asUser(copier,f.owner);
      await copier.query("select 1 from user_word_lists where id=$1 for update",[f.list]);
      await deleter.query("begin"); await asUser(deleter,f.owner);
      await deleter.query("set local role authenticated");
      await deleter.query("select 1 from user_word_list_items where list_id=$1 and word_id=$2 for update",[f.list,f.entry]);
      // Admission now refuses the inverse member→list wait immediately. Release
      // the list before the deletion proceeds; no successful partial plan exists.
      await expect(copier.query("select preview_collection_independent_copy_v1($1) result",[f.list])).rejects.toThrow("copy_source_changed");
      await copier.query("rollback");
      await deleter.query("delete from user_word_list_items where list_id=$1 and word_id=$2",[f.list,f.entry]);
      await deleter.query("commit");
    } finally {
      await copier.query("rollback"); await deleter.query("rollback");
      copier.release(); deleter.release();
      if(f) await cleanup([f.owner,f.viewer,f.second]);
    }
  });
});
