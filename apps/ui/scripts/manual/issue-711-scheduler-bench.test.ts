import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureLanguage, ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "../../tests/fsrs/dbTestUtils";

const dbUrl = getDbUrl();
(dbUrl ? describe : describe.skip)("#711 guarded actual scheduler benchmark", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());

  test("18k source-bound corpus, 100-item list and Review controls", async () => {
    const userId = randomUUID();
    const dictionaryId = randomUUID();
    const version = `qa711-${randomUUID()}`;
    const runId = randomUUID();
    const results: Array<Record<string, unknown>> = [];
    await withTransaction(pool, async (client) => {
      await client.query("SET LOCAL statement_timeout = '120s'");
      await ensureLanguage(client);
      await ensureUserWithSettings(client, userId, { daily_new_limit: 20, daily_review_limit: 40 });
      await client.query(`insert into dictionaries(id,language_code,slug,name,kind,visibility,is_editable,schema_key,schema_version,owner_user_id)
        values($1,'nl',$2,'QA 711 benchmark','curated','shared',false,'nl-vandale-v1',1,$3)`, [dictionaryId,version,userId]);
      await client.query(`insert into private.dictionary_import_runs
        (id,dictionary_id,identity_scheme_version,artifact_format_version,manifest_checksum,input_checksum,source_record_count,artifact_count,status)
        values($1,$2,$3,'test-v1','qa711','qa711',18000,18000,'completed')`, [runId,dictionaryId,version]);
      await client.query(`create temporary table qa711_entries on commit drop as
        select gen_random_uuid() id,n,((n-1)/4)::int group_n,((n-1)%4+1)::int sense from generate_series(1,18000) n`);
      await client.query(`insert into word_entries(id,dictionary_id,language_code,headword,meaning_id,part_of_speech,gender,is_nt2_2000,raw)
        select id,$1,'nl','qa711-'||group_n,sense,'noun','n',true,'{}'::jsonb from qa711_entries`,[dictionaryId]);
      await client.query(`insert into private.source_entry_bindings
        (dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
        select $1,$2,'entry-'||n,'group-'||group_n,sense,id,'active',$3,$3,'qa711','test-v1','fp-'||n,'{"kind":"test"}'::jsonb,'{"decision":"create"}'::jsonb from qa711_entries`,[dictionaryId,version,runId]);
      // The canonical-node trigger recomputes each group's derived status per row.
      // Suppress it only for this bulk fixture, then explicitly restore the known
      // renderability condition below. Transaction rollback restores table state.
      await client.query("ALTER TABLE private.platform_v2_content_nodes DISABLE TRIGGER USER");
      for (const kind of ["definition","example"] as const) {
        const locator = kind === "definition" ? "raw.meanings[0].definition" : "raw.meanings[0].examples[0]";
        await client.query(`insert into private.platform_v2_content_nodes
          (entry_id,kind,binding_state,first_source_revision,last_source_revision,source_native_key,source_text_fingerprint,diagnostic_locator,canonical_source_text,source_order)
          select id,$1,'active','qa711-v1','qa711-v1',$1||'-1','fp-'||$1||'-'||n,$2,'Fixture '||n,1 from qa711_entries`,[kind,locator]);
      }
      await client.query("ALTER TABLE private.platform_v2_content_nodes ENABLE TRIGGER USER");
      await client.query("DELETE FROM private.unrenderable_ordinary_direct_entries_v1 WHERE entry_id IN (SELECT id FROM qa711_entries)");
      await client.query("ANALYZE word_entries");
      await client.query("ANALYZE private.source_entry_bindings");
      await client.query("ANALYZE private.platform_v2_content_nodes");

      const { rows: [semantic] } = await client.query(`with introductions as (
        select binding.word_entry_id,lag(binding.word_entry_id) over (
          partition by binding.dictionary_id,binding.identity_scheme_version,binding.source_group_key
          order by binding.sense_ordinal,binding.word_entry_id) predecessor_entry_id
        from private.source_entry_bindings binding join private.platform_v2_content_nodes definition
          on definition.entry_id=binding.word_entry_id and definition.binding_state='active'
          and definition.parent_content_node_id is null and definition.kind='definition'
        where binding.dictionary_id=$1 and binding.identity_scheme_version=$2 and binding.binding_state='active'
      ) select count(*) filter(where predecessor_entry_id is null)::int first_meanings,
        count(*) filter(where predecessor_entry_id is not null)::int later_meanings,
        (select count(*)::int from private.platform_v2_content_nodes node join qa711_entries entry on entry.id=node.entry_id
          where node.binding_state='active' and node.parent_content_node_id is null and node.kind='example') examples,
        (select count(*)::int from private.unrenderable_ordinary_direct_entries_v1 x join qa711_entries entry on entry.id=x.entry_id) unrenderable
        from introductions`,[dictionaryId,version]);
      expect(semantic).toEqual({first_meanings:4500,later_meanings:13500,examples:18000,unrenderable:0});

      const { rows: [smallList] } = await client.query(
        `insert into word_lists(language_code,slug,name,sort_order) values('nl',$1,'QA 711 small list',1) returning id`,[version]);
      await client.query(`insert into word_list_items(list_id,word_id) select $1,id from qa711_entries where n<=100`,[smallList.id]);
      const fixtureDiagnostics = await client.query(`select
        (select count(*)::int from word_entries where dictionary_id=$1) entries,
        (select count(*)::int from private.source_entry_bindings where dictionary_id=$1 and binding_state='active') bindings,
        can_access_dictionary($2,$1,'read') readable`,[dictionaryId,userId]);
      expect(fixtureDiagnostics.rows[0]).toEqual({entries:18000,bindings:18000,readable:true});

      const dictionaryFilter = {dictionaryScope:{mode:"selected",languageCode:"nl",dictionaryIds:[dictionaryId]}};
      const execute = async (name:string,nestloop:boolean,cardFilter="new",listId:string|null=null,filter:unknown=dictionaryFilter) => {
        await client.query("SET LOCAL statement_timeout='12000ms'");
        await client.query(`SET LOCAL enable_nestloop=${nestloop ? "on":"off"}`);
        await client.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
        await client.query("SAVEPOINT qa711_scheduler_measure");
        const start=Date.now();
        try {
          const {rows}=await client.query(`select entry_id::text,queue_source from private.training_scheduler_candidates_v2(
            $1,ARRAY['word-to-definition'],$3::uuid,'curated',$4,'auto',ARRAY[]::uuid[],ARRAY[]::text[],$2::jsonb,false,false)`,
          [userId,JSON.stringify(filter),listId,cardFilter]);
          const categoryCounts=rows.reduce((counts,row)=>({...counts,[row.queue_source]:(counts[row.queue_source]??0)+1}),{} as Record<string,number>);
          const identityHash=createHash("sha256").update(rows.map(row=>row.entry_id).sort().join("\n")).digest("hex");
          results.push({name,elapsedMs:Date.now()-start,count:rows.length,categoryCounts,identityHash});
          await client.query("RELEASE SAVEPOINT qa711_scheduler_measure");
        } catch(error) {
          results.push({name,elapsedMs:Date.now()-start,errorCode:(error as {code?:string}).code??"unknown"});
          await client.query("ROLLBACK TO SAVEPOINT qa711_scheduler_measure");
          await client.query("RELEASE SAVEPOINT qa711_scheduler_measure");
        }
      };
      await execute("baseline-18k-new",true);
      await execute("hash-18k-new",false);
      await execute("baseline-small-list-new",true,"new",smallList.id,{});
      await execute("hash-small-list-new",false,"new",smallList.id,{});
      await client.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps,next_review_at)
        select $1,id,'word-to-definition',true,1,now()-interval '1 hour' from qa711_entries where sense=1`,[userId]);
      await execute("baseline-18k-review",true,"review");
      await execute("hash-18k-review",false,"review");
      for(const [baseline,candidate] of [[0,1],[2,3],[4,5]]) {
        expect(results[baseline]).toMatchObject({count:results[candidate].count,categoryCounts:results[candidate].categoryCounts,identityHash:results[candidate].identityHash});
      }
      expect(results[2].count).toBe(25);
      expect(results).toHaveLength(6);
    },userId);
    console.log("ISSUE711_ACTUAL_SCHEDULER_BENCH",JSON.stringify(results));
  });
});
