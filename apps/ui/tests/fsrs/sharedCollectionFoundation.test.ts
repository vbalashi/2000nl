import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseShareCode, shareInvitationUrl } from "@/lib/collections/sharing/shareCode";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const url = getDbUrl();
(url ? describe : describe.skip)("closed sharing foundation (not public acceptance)", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());

  async function entry(c: PoolClient, owner: string, headword: string) {
    const prior = (await c.query("select current_setting('request.jwt.claim.sub',true) value")).rows[0].value ?? "";
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
    const id = (await c.query("select create_user_dictionary_entry($1,null,$2) id", [owner,
      { headword, languageCode: "nl", definition: "a definition" }])).rows[0].id;
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [prior]);
    return id;
  }

  test("only selected owner entries, live membership/lifetime, and independent paths", async () => {
    const owner = randomUUID(), viewer = randomUUID(), outsider = randomUUID();
    await withTransaction(pool, async c => {
      for (const user of [owner, viewer, outsider]) await ensureUserWithSettings(c, user);
      const selected = await entry(c, owner, "selected");
      const sibling = await entry(c, owner, "sibling");
      const borrowed = await entry(c, outsider, "borrowed");
      const lists: string[] = [];
      const roots: string[] = [];
      for (const name of ["first", "second"]) {
        const list = (await c.query("insert into user_word_lists(user_id,name) values($1,$2) returning id", [owner, name])).rows[0].id;
        lists.push(list);
        await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2),($1,$3)", [list, selected, borrowed]);
        const root = (await c.query("insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) values($1,$2,true) returning id,access_lifetime", [owner, list])).rows[0];
        roots.push(root.id);
        await c.query("insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) values($1,$2,$3)", [viewer, root.id, root.access_lifetime]);
      }
      const ids = async (user = viewer) => (await c.query("select entry_id from private.shared_author_entry_ids_v1($1)", [user])).rows.map(r => r.entry_id);
      expect(await ids()).toEqual([selected]);
      expect(await ids(outsider)).toEqual([]);
      for (const [candidate, expected] of [[selected,true],[sibling,false],[borrowed,false]] as const) {
        expect((await c.query("select private.can_read_shared_author_entry_v1($1,$2) allowed", [viewer,candidate])).rows[0].allowed).toBe(expected);
      }
      expect((await c.query("select entry_id from private.shared_author_entry_ids_v1($1,'{}'::uuid[])", [viewer])).rows).toEqual([]);
      expect(await ids()).not.toContain(sibling);
      await c.query("update private.collection_sharing_roots set is_open=false where id=$1", [roots[0]]);
      expect(await ids()).toEqual([selected]);
      await c.query("delete from user_word_list_items where list_id=$1 and word_id=$2", [lists[1], selected]);
      expect(await ids()).toEqual([]);
      await c.query("update private.collection_sharing_roots set is_open=true,access_lifetime=gen_random_uuid() where id=$1", [roots[0]]);
      expect(await ids()).toEqual([]);
      await c.query("update private.collection_sharing_subscriptions s set access_lifetime=r.access_lifetime from private.collection_sharing_roots r where s.root_id=r.id and r.id=$1", [roots[0]]);
      expect(await ids()).toEqual([selected]);
      await c.query("update word_entries set archived_at=now() where id=$1", [selected]);
      expect(await ids()).toEqual([]);
    }, owner);
  });

  test("database-generated invitation uses exactly the canonical code in its URL", async () => {
    await withTransaction(pool, async c => {
      const code = (await c.query("select private.generate_collection_share_code_v1() code")).rows[0].code;
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(parseShareCode(shareInvitationUrl(code, "https://2000.dilum.io"), "https://2000.dilum.io")).toBe(code);
    });
  });

  test("invitation identity and receipt size constraints reject unsafe stored shapes", async () => {
    const owner = randomUUID();
    await withTransaction(pool, async c => {
      await ensureUserWithSettings(c, owner);
      const list = (await c.query("insert into user_word_lists(user_id,name) values($1,'invitation fixture') returning id", [owner])).rows[0].id;
      const root = (await c.query("insert into private.collection_sharing_roots(owner_user_id,collection_id) values($1,$2) returning id", [owner,list])).rows[0].id;
      const code = (await c.query("select private.generate_collection_share_code_v1() code")).rows[0].code;
      await c.query("insert into private.collection_sharing_invitations(root_id,role,code,secret_hash) values($1,'viewer',$2,sha256(convert_to($2,'UTF8')))", [root,code]);
      const rejected = async (sql: string, args: unknown[], errorCode: string) => {
        await c.query("savepoint invalid_shape");
        await expect(c.query(sql,args)).rejects.toMatchObject({ code: errorCode });
        await c.query("rollback to savepoint invalid_shape");
        await c.query("release savepoint invalid_shape");
      };
      await rejected("insert into private.collection_sharing_invitations(root_id,role,code,secret_hash) values($1,'editor',$2,sha256(convert_to($2,'UTF8')))", [root,code], "23505");
      await rejected("insert into private.collection_sharing_invitations(root_id,role,code,secret_hash) values($1,'editor','A',sha256(convert_to('A','UTF8')))", [root], "23514");
      await rejected("insert into private.collection_sharing_command_receipts(user_id,operation_id,request_hash,response) values($1,$2,sha256('x'::bytea),$3)", [owner,randomUUID(),{ text: "x".repeat(20000) }], "23514");
    }, owner);
  });

  test("storage and arbitrary-principal helpers expose no API-role access", async () => {
    await withTransaction(pool, async c => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const table of ["collection_sharing_roots", "collection_sharing_subscriptions", "collection_sharing_invitations", "collection_sharing_command_receipts", "live_collection_sharing_subscriptions_v1", "shared_author_entry_memberships_v1"]) {
          expect((await c.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [role, `private.${table}`])).rows[0].allowed).toBe(false);
        }
        for (const fn of ["shared_collection_ids_v1(uuid)", "shared_author_entry_ids_v1(uuid,uuid[])", "can_read_shared_author_entry_v1(uuid,uuid)", "generate_collection_share_code_v1()"]) {
          expect((await c.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, `private.${fn}`])).rows[0].allowed).toBe(false);
        }
      }
    });
  });
});
