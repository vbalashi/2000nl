import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";
const url = getDbUrl();
async function bindSourceEntries(
  client: PoolClient,
  entryIds: string[],
  groupKey = `private-source-group-${randomUUID()}`,
) {
  const identitySchemeVersion = `platform-v2-test-${randomUUID()}`;
  const { rows: dictionaryRows } = await client.query(
    `select dictionary_id from word_entries where id = $1`,
    [entryIds[0]],
  );
  const dictionaryId = dictionaryRows[0].dictionary_id as string;
  const { rows: runRows } = await client.query(
    `insert into private.dictionary_import_runs (
       dictionary_id,
       identity_scheme_version,
       artifact_format_version,
       manifest_checksum,
       input_checksum,
       source_record_count,
       artifact_count,
       status
     )
     values ($1, $2, 'test-v1', $3, $4, $5, $5, 'completed')
     returning id`,
    [
      dictionaryId,
      identitySchemeVersion,
      randomUUID(),
      randomUUID(),
      entryIds.length,
    ],
  );
  const importRunId = runRows[0].id as string;

  for (const [index, entryId] of entryIds.entries()) {
    await client.query(
      `insert into private.source_entry_bindings (
         dictionary_id,
         identity_scheme_version,
         source_entry_key,
         source_group_key,
         sense_ordinal,
         word_entry_id,
         binding_state,
         first_seen_run_id,
         last_seen_run_id,
         manifest_checksum,
         content_fingerprint_version,
         content_fingerprint,
         identity_evidence,
         reconciliation_decision
       )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         'active',
         $7,
         $7,
         'test-manifest',
         'test-v1',
         $8,
         '{"kind":"test"}'::jsonb,
         '{"decision":"create"}'::jsonb
       )`,
      [
        dictionaryId,
        identitySchemeVersion,
        `source-entry-${index + 1}-${randomUUID()}`,
        groupKey,
        index + 1,
        entryId,
        importRunId,
        `fingerprint-${index + 1}`,
      ],
    );
  }

  return groupKey;
}

async function fixture(c: PoolClient) {
  const owner = randomUUID(); await ensureUserWithSettings(c, owner);
  const dictionary = (await c.query("insert into dictionaries(language_code,slug,name,publication_state) values('nl',$1,'Material groups','general') returning id", [randomUUID()])).rows[0].id;
  const list = (await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'Lesson','nl','nl') returning id", [owner])).rows[0].id;
  const ids: string[] = [];
  for (let group = 0; group < 3; group++) {
    const groupIds: string[] = [];
    for (let meaning = 1; meaning <= 3; meaning++) {
      const id = await insertWord(c, `material-${group}`); ids.push(id); groupIds.push(id);
      await c.query("update word_entries set dictionary_id=$2,meaning_id=$3,part_of_speech='noun',gender='de' where id=$1", [id,dictionary,meaning]);
      await c.query("select refresh_dictionary_search_document($1,2)", [id]);
      if (meaning <= 2) await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)", [list,id]);
    }
    await bindSourceEntries(c,groupIds);
  }
  return {owner,dictionary,list,ids};
}
async function read(c: PoolClient, owner: string, material: unknown, cursor: string|null=null, query='') {
  return (await c.query("select lookup_platform_v2_library_material_entries($1,$2,'nl',null,$3,1,50,'{}',$4) payload", [owner,query,cursor,JSON.stringify(material)])).rows[0].payload;
}
(url ? describe : describe.skip)("material grouped Library RPC", () => {
  const pool = new Pool({connectionString:url});
  beforeAll(() => runMigrations(pool)); afterAll(() => pool.end());
  test("deduplicates exact memberships before count/page and hydrates full articles", async () => {
    await withTransaction(pool, async c => {
      const f=await fixture(c); const scope={kind:'collection',id:f.list,collectionType:'user'};
      const all: string[]=[]; let cursor: string|null=null;
      do {
        const page=await read(c,f.owner,scope,cursor);
        expect(page.error).toBeUndefined(); expect(page.page.totalGroups).toBe(3);
        expect(page.items).toHaveLength(3); expect(page.page.matchingEntryIds).toHaveLength(2);
        expect(page.items.filter((item:{id:string})=>page.page.matchingEntryIds.includes(item.id))).toHaveLength(2);
        all.push(...page.page.matchingEntryIds); cursor=page.page.nextGroupCursor;
      } while(cursor);
      expect(new Set(all).size).toBe(6);
      const query=await read(c,f.owner,scope,null,'material-1');
      expect(query.page.totalGroups).toBe(1); expect(query.items).toHaveLength(3);
      expect((await read(c,f.owner,{...scope,id:randomUUID()})).error).toBe('material_not_accessible');
    });
  });
  test("recursive overlapping labels deduplicate collections; foreign scope is opaque", async () => {
    await withTransaction(pool, async c => {
      const f=await fixture(c);
      const root=randomUUID(), child=randomUUID();
      await c.query("insert into private.collection_labels(user_id,id,parent_id,name) values($1,$2,null,'Root'),($1,$3,$2,'Child')",[f.owner,root,child]);
      await c.query("insert into private.collection_label_assignments(user_id,collection_id,label_id) values($1,$2,$3),($1,$2,$4)",[f.owner,f.list,root,child]);
      const page=await read(c,f.owner,{kind:'label',id:root});
      expect(page.page.totalGroups).toBe(3); expect(page.page.matchingEntryIds).toHaveLength(2);
      expect((await read(c,randomUUID(),{kind:'label',id:root})).error).toBe('material_not_accessible');
      expect((await read(c,f.owner,{kind:'label',id:root},page.page.nextGroupCursor,'material-1')).error).toBe('invalid_cursor');
      await c.query("delete from private.collection_label_assignments where user_id=$1 and collection_id=$2",[f.owner,f.list]);
      expect((await read(c,f.owner,{kind:'label',id:root},page.page.nextGroupCursor)).error).toBe('invalid_cursor');

    });
  });
  test("a foreign personal meaning never becomes a sibling through shared spelling or list membership", async () => {
    await withTransaction(pool, async c => {
      const f=await fixture(c), other=randomUUID(); await ensureUserWithSettings(c,other);
      const dictionary=(await c.query("insert into dictionaries(language_code,slug,name,kind,publication_state,owner_user_id,is_editable,schema_key,schema_version) values('nl',$1,'Foreign personal','user','general',$2,true,'user-entry-v1',1) returning id",[randomUUID(),other])).rows[0].id;
      await c.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
      const entry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw) values($1,'nl','material-0',1,'noun','{}') returning id",[dictionary])).rows[0].id;
      await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[f.list,entry]);
      await c.query("select set_config('request.jwt.claim.sub',$1,true)",[f.owner]);
      const page=await read(c,f.owner,{kind:'collection',id:f.list,collectionType:'user'});
      expect(page.page.totalGroups).toBe(3); expect(page.page.unavailableEntryCount).toBe(1);
      expect(page.items).toHaveLength(3); expect(JSON.stringify(page.items)).not.toContain(entry);
      expect(page.page.matchingEntryIds).not.toContain(entry);
      expect((await c.query("select read_platform_v2_library_group($1,$2,50) payload",[f.owner,entry])).rows[0].payload.error).toBe('entry_not_accessible');
    });
  });
  test("browse policy and service grants are independent of training", async () => {
    await withTransaction(pool, async c => {
      const f=await fixture(c);
      const source=await read(c,f.owner,{kind:'collection',id:f.list,collectionType:'user'});
      expect(source.items).toHaveLength(3);
      const exact=(await c.query("select read_platform_v2_library_group($1,$2,50) payload",[f.owner,f.ids[0]])).rows[0].payload;
      expect(exact.items).toHaveLength(3);
      const grants=(await c.query("select has_function_privilege('authenticated','public.lookup_platform_v2_library_material_entries(uuid,text,text,uuid[],text,integer,integer,jsonb,jsonb)','execute') allowed")).rows[0];
      expect(grants.allowed).toBe(false);
      const other=randomUUID(); await ensureUserWithSettings(c,other);
      await c.query("update dictionaries set visibility='private',owner_user_id=$2 where id=$1",[f.dictionary,other]);
      const unavailable=await read(c,f.owner,{kind:'collection',id:f.list,collectionType:'user'});
      expect(unavailable.items).toEqual([]); expect(unavailable.page.unavailableEntryCount).toBe(6);
      expect((await c.query("select read_platform_v2_library_group($1,$2,50) payload",[f.owner,f.ids[0]])).rows[0].payload.error).toBe('entry_not_accessible');
    });
  });
});
