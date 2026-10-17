import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from "./dbTestUtils";

const url = getDbUrl();
const describeDb = url ? describe : describe.skip;
const forward = "word-to-definition";
const reverse = "definition-to-word";
const baseline = fs.readFileSync(path.resolve(__dirname, "fixtures/stats737Baseline.sql"), "utf8");

async function parity(client: PoolClient, user: string, modes: string[] | null, list: string | null, type: string | null) {
  const { rows: [row] } = await client.query(`select
    private.stats737_baseline($1,$2,$3,$4,'Pacific/Honolulu') as old,
    public.get_detailed_training_stats($1,$2,$3,$4) as four,
    public.get_detailed_training_stats($1,$2,$3,$4,'Pacific/Honolulu') as five`, [user, modes, list, type]);
  expect(row.four).toEqual(row.old);
  expect(row.five).toEqual(row.old);
  expect(Object.keys(row.four)).toHaveLength(11);
  return row.four;
}

describeDb("ordinary stats independent pre-230 parity", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  test("empty history, absent settings, defaults and owner guards", async () => {
    const user = randomUUID();
    await withTransaction(pool, async client => {
      await client.query(baseline);
      await client.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@test.local`]);
      for (const modes of [null, [], [forward], [forward, reverse], ["unknown-mode"]]) {
        const stats = await parity(client, user, modes, null, null);
        expect(stats).toMatchObject({ dailyNewLimit: 10, totalWordsLearned: 0, newWordsToday: 0, reviewCardsDue: 0 });
      }
      const defaults = await client.query("select public.get_detailed_training_stats($1) as stats", [user]);
      expect(defaults.rows[0].stats).toEqual(await parity(client, user, [forward], null, "curated"));
    }, user);
    for (const authenticatedUser of [undefined, randomUUID()]) {
      for (const suffix of ["", ",'UTC'"]) {
        await expect(withTransaction(pool, async client => {
          await client.query(`select public.get_detailed_training_stats($1,ARRAY[$2]::text[],null,'curated'${suffix})`, [user, forward]);
        }, authenticatedUser)).rejects.toThrow("unauthorized");
      }
    }
  });

  test.each([
    ["UTC", "2026-01-15T03:59:59Z"], ["UTC", "2026-01-15T04:00:00Z"],
    ["Europe/Amsterdam", "2026-03-29T01:30:00Z"],
    ["Europe/Amsterdam", "2026-10-25T02:30:00Z"],
    ["Pacific/Kiritimati", "2026-01-15T14:00:00Z"],
  ])("preserves boundary/history and all modes/list metrics: %s %s", async (timezone, clock) => {
    const user = randomUUID();
    await withTransaction(pool, async client => {
      await client.query(baseline);
      await ensureUserWithSettings(client, user, { daily_new_limit: 7 });
      await client.query("update user_settings set training_schedule_timezone=$2 where user_id=$1", [user, timezone]);
      // The unchanged effective local helper is clock-injected transactionally so
      // DST and 04:00 cases run on every date. Rollback restores the real clock.
      const { rows: [definition] } = await client.query("select pg_get_functiondef('private.training_local_daily_stats_v1(uuid,text[],uuid,text,text)'::regprocedure) as sql");
      expect(definition.sql).toContain("clock_timestamp()");
      await client.query(definition.sql.replace("clock_timestamp()", `'${clock}'::timestamptz`));
      const entries = [];
      for (let i = 0; i < 8; i++) entries.push(await insertWord(client, `stats737-${i}-${randomUUID()}`));
      await client.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,next_review_at,frozen_until,hidden)
        select $1, id, mode, true, $3::timestamptz-interval '1 day',
          case when n=3 then $3::timestamptz+interval '10 days' end, n=4
        from unnest($2::uuid[]) with ordinality as e(id,n) cross join unnest(ARRAY[$4,$5]::text[]) mode`, [user, entries, clock, forward, reverse]);
      await client.query(`with bounds as (select * from private.training_study_day_bounds_v1($3::timestamptz,$4))
        insert into user_card_action_events(user_id,entry_id,card_type_id,action,action_payload_hash,created_at)
        select $1,id,$5,'start-learning','fixture',
          case n when 1 then start_at-interval '1 second' when 2 then start_at when 3 then end_at-interval '1 second' else end_at end
        from unnest($2::uuid[]) with ordinality as e(id,n) cross join bounds where n<=4`, [user, entries, clock, timezone, forward]);
      await client.query(`with bounds as (select * from private.training_study_day_bounds_v1($3::timestamptz,$4))
        insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at,interval_after)
        select $1,id,mode,3,case when n=5 then 'new' else 'review' end,
          start_at+interval '1 minute',case when n=5 then 2 else 0 end
        from unnest($2::uuid[]) with ordinality as e(id,n) cross join bounds cross join unnest(ARRAY[$5,$6]::text[]) mode where n>=5`, [user, entries, clock, timezone, forward, reverse]);
      const { rows: [list] } = await client.query("insert into user_word_lists(user_id,language_code,primary_language_code,name) values($1,'nl','nl','stats parity') returning id", [user]);
      await client.query("insert into user_word_list_items(list_id,word_id) select $1,unnest($2::uuid[])", [list.id, entries]);
      for (const modes of [null, [], [forward], [forward, reverse], ["unknown-mode"]]) {
        for (const [listId, type] of [[null, null], [list.id, "user"], [list.id, "curated"], [list.id, null], [list.id, "invalid"]] as const) {
          await parity(client, user, modes, listId, type);
        }
      }
      const stats = await parity(client, user, [forward, reverse], list.id, "user");
      expect(stats).toMatchObject({ dailyNewLimit: 7, totalWordsLearned: 8, totalWordsInList: 8,
        newWordsToday: 3, newCardsToday: 4, learningStartedToday: 2,
        graduatedNewWordsToday: 1, reviewWordsDone: 3, reviewCardsDone: 6,
        reviewWordsDue: 5, reviewCardsDue: 10 });
    }, user);
  });
  test("preserves exact-entry/pair exclusions, Known, access, language and real curated scope", async () => {
    const user = randomUUID(), other = randomUUID();
    await withTransaction(pool, async client => {
      await client.query(baseline);
      await ensureUserWithSettings(client, user, { daily_new_limit: 0 });
      await ensureUserWithSettings(client, other);
      const ids = [];
      for (let i=0; i<6; i++) ids.push(await insertWord(client, `same-sibling-${randomUUID()}`));
      await client.query("update word_entries set headword='same sibling' where id=any($1::uuid[])", [ids]);
      const { rows: [dictionary] } = await client.query(`insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier,schema_key,schema_version,publication_state)
        values('nl',$1,'Stats access','curated','shared','free','nl-vandale-v1',1,'restricted') returning id`, [randomUUID()]);
      await client.query("update word_entries set dictionary_id=$2 where id=$1", [ids[5], dictionary.id]);
      await client.query("insert into languages(code,name) values('en','English') on conflict do nothing");
      await client.query("update word_entries set language_code='en' where id=$1", [ids[4]]);
      const { rows: [group] } = await client.query(`insert into private.platform_v2_headword_groups(dictionary_id,management_kind,identity_scheme_version,source_group_key)
        values($1,'source','stats737',$2) returning id`, [dictionary.id, randomUUID()]);
      await client.query(`insert into private.training_headword_exclusions(user_id,headword_group_id,entry_id,created_at)
        values($1,$2,$3,now())`, [user,group.id,ids[0]]);
      await client.query(`insert into private.training_pair_exclusions(user_id,pair_key,family,entry_id,created_at)
        values($1,private.training_pair_key_v1('meaning',$2,null,null,$3),'meaning',$2,now())`, [user,ids[2],forward]);
      await client.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,next_review_at)
        select $1,id,mode,true,now()-interval '1 hour' from unnest($2::uuid[]) id cross join unnest(ARRAY[$3,$4]::text[]) mode`, [user,ids,forward,reverse]);
      // Known is characterized with its real event/mark relation. Existing
      // stats semantics remain unchanged even when historical state is present.
      const { rows: [event] } = await client.query(`insert into user_card_action_events(user_id,entry_id,card_type_id,action,action_payload_hash)
        values($1,$2,$3,'mark-known','known-fixture') returning id`, [user,ids[3],forward]);
      await client.query(`insert into user_card_known_marks(user_id,entry_id,card_type_id,mark_event_id)
        values($1,$2,$3,$4)`, [user,ids[3],forward,event.id]);
      const { rows: [list] } = await client.query(`insert into word_lists(language_code,slug,name) values('nl',$1,'Stats curated') returning id`, [randomUUID()]);
      await client.query("insert into word_list_items(list_id,word_id) select $1,unnest($2::uuid[])", [list.id,ids]);
      const { rows: [foreignList] } = await client.query("insert into user_word_lists(user_id,language_code,primary_language_code,name) values($1,'nl','nl','foreign') returning id", [other]);
      await client.query("insert into user_word_list_items(list_id,word_id) select $1,unnest($2::uuid[])", [foreignList.id,ids]);
      expect(await parity(client,user,[forward,reverse],foreignList.id,"user")).toMatchObject({totalWordsInList:0,totalWordsLearned:0,reviewCardsDue:0});
      expect(await parity(client,user,[forward,reverse],list.id,"curated")).toMatchObject({dailyNewLimit:0,totalWordsInList:5,totalWordsLearned:5,reviewWordsDue:3,reviewCardsDue:6});
      await client.query("insert into dictionary_entitlements(dictionary_id,subject_type,subject_key,permission) values($1,'user',$2,'read')", [dictionary.id,user]);
      expect(await parity(client,user,[forward,reverse],list.id,null)).toMatchObject({totalWordsInList:6,totalWordsLearned:6,reviewWordsDue:4,reviewCardsDue:8});
      await client.query("update dictionaries set publication_state='unpublished' where id=$1", [dictionary.id]);
      expect(await parity(client,user,[forward,reverse],list.id,"curated")).toMatchObject({totalWordsInList:5,reviewCardsDue:6});
      await client.query("delete from user_settings where user_id=$1", [user]);
      expect(await parity(client,user,[],list.id,"curated")).toMatchObject({dailyNewLimit:10});
    }, user);
  });

  test("keeps authenticated public overloads and private helper ACL/attributes", async () => {
    const { rows } = await pool.query(`select p.oid::regprocedure::text as signature,
      p.prosecdef, p.provolatile, p.proconfig, pg_get_userbyid(p.proowner) as owner,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('service_role',p.oid,'execute') as service_role
      from pg_proc p where p.oid=any(array[
        'public.get_detailed_training_stats(uuid,text[],uuid,text)'::regprocedure,
        'public.get_detailed_training_stats(uuid,text[],uuid,text,text)'::regprocedure,
        'private.training_stats_totals_v1(uuid,text[],uuid,text)'::regprocedure]) order by signature`);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({prosecdef:true,provolatile:'s',owner:'postgres',anon:false,service_role:false});
      expect(row.authenticated).toBe(!row.signature.startsWith('private.'));
      expect(row.proconfig).toEqual([row.signature.startsWith('private.') ? 'search_path=public, pg_temp' : 'search_path=public, private, pg_temp']);
    }
  });

});
