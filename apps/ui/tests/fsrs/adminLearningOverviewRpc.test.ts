import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLanguage, ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const url = getDbUrl();
const describeIfDb = url ? describe : describe.skip;

describeIfDb("Admin learning overview", () => {
  const pool = new Pool({ connectionString: url });

  beforeAll(async () => {
    await runMigrations(pool);
    // Until release coordination assigns a migration slot, qualify the SQL on
    // the isolated test database above the current public schema.
    await pool.query(readFileSync(resolve(process.cwd(), "../../db/admin-user-overview.sql"), "utf8"));
  });
  afterAll(async () => { await pool.end(); });

  it("reports learner-local rated activity, material and real session outcomes with mandatory audit", async () => {
    await withTransaction(pool, async client => {
      const operator = randomUUID();
      const learner = randomUUID();
      const other = randomUUID();
      const request = randomUUID();
      for (const user of [operator, learner, other]) await ensureUserWithSettings(client, user);
      await ensureLanguage(client, "nl");
      await ensureLanguage(client, "es");
      await client.query(
        `update user_settings set training_schedule_timezone='Europe/Amsterdam',
           material_preferences='{"schemaVersion":1,"learningLanguages":[{"code":"nl","paused":false},{"code":"es","paused":true}],"disabledDictionaryIds":[]}'
         where user_id=$1`, [learner],
      );
      await client.query(
        "insert into admin_operators(email,user_id,is_active,permissions) values($1,$2,true,ARRAY['users.read'])",
        [`operator-${operator}@example.test`, operator],
      );
      const { rows: [time] } = await client.query(`
        select private.training_study_day_date_v1(statement_timestamp(),'Europe/Amsterdam')::text today,
          (private.training_study_day_date_v1(statement_timestamp(),'Europe/Amsterdam')-1)::text yesterday,
          (private.training_study_day_date_v1(statement_timestamp(),'Europe/Amsterdam')-2)::text previous
      `);
      const { rows: [word] } = await client.query(
        "insert into word_entries(language_code,headword,raw) values('nl',$1,'{}') returning id",
        [`fixture-${randomUUID()}`],
      );
      await client.query(
        `insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at)
          values ($1,$3,'word-to-definition',3,'review',($4::date+time '03:59') at time zone 'Europe/Amsterdam'),
                 ($1,$3,'word-to-definition',4,'review',($4::date+time '04:00') at time zone 'Europe/Amsterdam'),
                 ($1,$3,'word-to-definition',0,'review',($4::date+time '05:00') at time zone 'Europe/Amsterdam'),
                 ($2,$3,'word-to-definition',4,'review',($4::date+time '06:00') at time zone 'Europe/Amsterdam')`,
        [learner, other, word.id, time.yesterday],
      );
      const { rows: [list] } = await client.query(
        "insert into user_word_lists(user_id,name,language_code) values($1,'private fixture','nl') returning id", [learner],
      );
      await client.query(
        `insert into user_card_status(user_id,entry_id,card_type_id,in_learning,fsrs_enabled,next_review_at)
          values($1,$2,'word-to-definition',true,true,now()-interval '1 day'),
                ($1,$2,'definition-to-word',true,true,now()+interval '1 day')`,
        [learner, word.id],
      );
      const { rows: [session] } = await client.query(
        `insert into training_sessions(user_id,session_size,card_type_ids,card_filter,list_type,list_id,created_at,completed_at,completion_reason)
          values($1,'5','{}','both','user',$2,($3::date+time '05:00') at time zone 'Europe/Amsterdam',
            ($3::date+time '05:01') at time zone 'Europe/Amsterdam','exhausted') returning id`,
        [learner, list.id, time.yesterday],
      );
      await client.query(
        `insert into private.training_active_time_v1
           (user_id,measurement_id,session_id,family,entry_id,card_type_id,language_code,active_ms,observed_at)
          values ($1,gen_random_uuid(),$2,'meaning',$3,'word-to-definition','nl',20000,
            ($4::date+time '04:00:10') at time zone 'Europe/Amsterdam')`,
        [learner, session.id, word.id, time.yesterday],
      );
      const read = async (actor: string, lang: string | null = null, day: string | null = null, auditId = randomUUID()) => {
        const { rows: [result] } = await client.query(
          "select public.admin_user_learning_overview_v1($1,$2,$3,$4,$5) result", [actor, learner, auditId, lang, day],
        );
        return result.result;
      };
      expect(await read(other)).toEqual({ error: "forbidden" });
      expect(await read(operator, null, "2000-01-01")).toEqual({ error: "invalid_selection" });
      const all = await read(operator, null, null, request);
      expect(all.days).toHaveLength(365);
      expect(all.days.at(-1).date).toBe(time.today);
      expect(all.days.at(-2)).toMatchObject({ date: time.yesterday, answers: 1, activeMilliseconds: 10000 });
      expect(all.days.at(-3)).toMatchObject({ date: time.previous, answers: 1, activeMilliseconds: 10000 });
      expect(all.languages).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "nl", status: "active" }),
        expect.objectContaining({ code: "es", status: "paused" }),
      ]));
      expect(all.material).toMatchObject({ learningWords: 1, dueCards: 1, personalLists: 1, usedPersonalLists: 0 });
      const spanish = await read(operator, "es");
      expect(spanish.days.every((day: { answers: number }) => day.answers === 0)).toBe(true);
      expect(spanish.material.personalLists).toBe(0);
      expect(await read(operator, "es", time.yesterday)).toEqual({ sessions: [], hasMore: false });
      const history = await read(operator, "nl", time.yesterday);
      expect(history.sessions).toEqual([expect.objectContaining({ outcome: "empty", source: "personal", cards: 0 })]);
      expect(JSON.stringify(history)).not.toContain("private fixture");
      const { rows: [audit] } = await client.query(
        "select action,outcome,target_id from admin_audit_events where request_id=$1", [request],
      );
      expect(audit).toEqual({ action: "user.activity.read", outcome: "success", target_id: learner });
    });
  });

  it("allows only the service role to invoke the overview RPC", async () => {
    const { rows: [result] } = await pool.query(`
      select has_function_privilege('anon','public.admin_user_learning_overview_v1(uuid,uuid,uuid,text,date)','EXECUTE') anon,
        has_function_privilege('authenticated','public.admin_user_learning_overview_v1(uuid,uuid,uuid,text,date)','EXECUTE') learner,
        has_function_privilege('service_role','public.admin_user_learning_overview_v1(uuid,uuid,uuid,text,date)','EXECUTE') service
    `);
    expect(result).toEqual({ anon: false, learner: false, service: true });
  });
});
