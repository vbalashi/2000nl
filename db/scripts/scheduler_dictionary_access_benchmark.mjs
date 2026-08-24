#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromUi = createRequire(path.join(repoRoot, "apps/ui/package.json"));
const { Client } = requireFromUi("pg");

const connectionString = process.env.ISSUE_232_BENCHMARK_DB_URL;
if (!connectionString) throw new Error("ISSUE_232_BENCHMARK_DB_URL is required");
const target = new URL(connectionString);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  !target.pathname.toLowerCase().includes("issue232")
) {
  throw new Error("Issue #232 benchmark only accepts a loopback issue232 database");
}

const ENTRY_COUNT = 18_184;
const WARM_SAMPLES = 30;
const USER_ID = "23200000-0000-0000-0000-000000000001";
const OTHER_USER_ID = "23200000-0000-0000-0000-000000000002";
const DICTIONARIES = Object.freeze({
  system: "232d0000-0000-0000-0000-000000000001",
  owned: "232d0000-0000-0000-0000-000000000002",
  public: "232d0000-0000-0000-0000-000000000003",
  entitled: "232d0000-0000-0000-0000-000000000004",
  denied: "232d0000-0000-0000-0000-000000000005",
});
export const BUDGET_MS = Object.freeze({ first: 2_000, warmP95: 1_000, warmMax: 2_000 });

const round = (value) => Number(value.toFixed(1));
const summarize = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio) => sorted[Math.ceil(sorted.length * ratio) - 1];
  return {
    count: sorted.length,
    p50: round(percentile(0.5)),
    p95: round(percentile(0.95)),
    max: round(sorted.at(-1)),
  };
};
const measure = async (client, sql, params) => {
  const startedAt = performance.now();
  await client.query(sql, params);
  return performance.now() - startedAt;
};
const withinBudget = (series) =>
  series.first <= BUDGET_MS.first &&
  series.warm.p95 <= BUDGET_MS.warmP95 &&
  series.warm.max <= BUDGET_MS.warmMax;

const seedFixture = async (client) => {
  await client.query(
    `insert into auth.users (id, email) values
       ($1, 'test@2000nl.test'),
       ($2, 'issue232-other@test.local')
     on conflict (id) do update set email = excluded.email`,
    [USER_ID, OTHER_USER_ID],
  );
  await client.query(
    `insert into user_settings (
       user_id, subscription_tier, daily_new_limit, daily_review_limit, mix_mode
     ) values ($1, 'free', 10, 200, 'mixed')
     on conflict (user_id) do update set
       subscription_tier = excluded.subscription_tier,
       daily_new_limit = excluded.daily_new_limit,
       daily_review_limit = excluded.daily_review_limit`,
    [USER_ID],
  );
  await client.query(
    `insert into dictionaries (
       id, language_code, slug, name, kind, visibility, owner_user_id,
       minimum_subscription_tier
     ) values
       ($1, 'nl', 'issue232-system', 'Issue 232 system', 'curated', 'system', null, 'free'),
       ($2, 'nl', 'issue232-owned', 'Issue 232 owned', 'user', 'private', $6, 'free'),
       ($3, 'nl', 'issue232-public', 'Issue 232 public', 'curated', 'public', null, 'free'),
       ($4, 'nl', 'issue232-entitled', 'Issue 232 entitled', 'curated', 'private', null, 'free'),
       ($5, 'nl', 'issue232-denied', 'Issue 232 denied', 'user', 'private', $7, 'free')`,
    [
      DICTIONARIES.system,
      DICTIONARIES.owned,
      DICTIONARIES.public,
      DICTIONARIES.entitled,
      DICTIONARIES.denied,
      USER_ID,
      OTHER_USER_ID,
    ],
  );
  await client.query(
    `insert into dictionary_entitlements (
       dictionary_id, subject_type, subject_key, permission
     ) values ($1, 'user', $2, 'read')`,
    [DICTIONARIES.entitled, USER_ID],
  );
  await client.query(
    `insert into word_entries (
       dictionary_id, language_code, headword, meaning_id, part_of_speech,
       is_nt2_2000, raw
     )
     select case
       when sample <= 18170 then $1::uuid
       when sample <= 18175 then $2::uuid
       when sample <= 18179 then $3::uuid
       when sample <= 18182 then $4::uuid
       else $5::uuid
     end,
     'nl', 'issue232-entry-' || sample, sample, 'noun', true, '{}'::jsonb
     from generate_series(1, $6::int) sample`,
    [
      DICTIONARIES.system,
      DICTIONARIES.owned,
      DICTIONARIES.public,
      DICTIONARIES.entitled,
      DICTIONARIES.denied,
      ENTRY_COUNT,
    ],
  );
  await client.query(`analyze dictionaries, dictionary_entitlements, word_entries`);
};

const client = new Client({ connectionString });
const statsClient = new Client({ connectionString });
await statsClient.connect();
const readAccessFunctionCalls = async () => {
  await statsClient.query(`select pg_stat_clear_snapshot()`);
  const { rows } = await statsClient.query(
    `select coalesce((
       select calls
       from pg_stat_user_functions
       where funcid = 'can_access_dictionary(uuid,uuid,text)'::regprocedure
     ), 0)::int as calls`,
  );
  return rows[0].calls;
};
const accessCallsBefore = await readAccessFunctionCalls();
await client.connect();
let exitCode = 0;
let result;
try {
  await client.query("begin");
  await client.query(`set local track_functions = 'all'`);
  await client.query(`set local statement_timeout = '15s'`);
  await seedFixture(client);
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [USER_ID]);

  const { rows: fixtureRows } = await client.query(
    `select count(*)::int entries,
      count(dictionary_id)::int non_null_dictionary_ids,
      count(*) filter (where dictionary_id <> $2)::int readable_entries,
      count(*) filter (where dictionary_id = $2)::int denied_entries,
      count(distinct dictionary_id)::int dictionaries,
      (select count(*)::int from dictionaries) registered_dictionaries,
      (select email from auth.users where id = $1) qa_email
     from word_entries
     where headword like 'issue232-entry-%'`,
    [USER_ID, DICTIONARIES.denied],
  );
  const fixture = fixtureRows[0];
  const { rows: policyRows } = await client.query(
    `select id, can_access_dictionary($1, id, 'read') as readable
     from dictionaries
     where id = any($2::uuid[])
     order by id`,
    [USER_ID, Object.values(DICTIONARIES)],
  );
  if (
    fixture.entries !== ENTRY_COUNT ||
    fixture.non_null_dictionary_ids !== ENTRY_COUNT ||
    fixture.qa_email !== "test@2000nl.test" ||
    fixture.dictionaries !== 5 ||
    fixture.readable_entries !== 18_182 ||
    fixture.denied_entries !== 2
  ) {
    throw new Error(`Issue #232 benchmark fixture mismatch: ${JSON.stringify(fixture)}`);
  }
  const policy = Object.fromEntries(policyRows.map((row) => [row.id, row.readable]));
  if (
    !policy[DICTIONARIES.system] ||
    !policy[DICTIONARIES.owned] ||
    !policy[DICTIONARIES.public] ||
    !policy[DICTIONARIES.entitled] ||
    policy[DICTIONARIES.denied]
  ) {
    throw new Error(`Issue #232 dictionary policy mismatch: ${JSON.stringify(policy)}`);
  }

  const queries = {
    sessionPlan: {
      sql: `select get_training_session_plan(
        $1, ARRAY['word-to-definition'], null, 'curated', 'both', '{}'
      )`,
      params: [USER_ID],
    },
    nextCard: {
      sql: `select get_next_card(
        $1, ARRAY['word-to-definition'], ARRAY[]::uuid[], null,
        'curated', 'both', 'new', ARRAY[]::text[]
      )`,
      params: [USER_ID],
    },
  };
  const series = {};
  for (const [name, query] of Object.entries(queries)) {
    await client.query("discard plans");
    const first = await measure(client, query.sql, query.params);
    const warm = [];
    for (let sample = 0; sample < WARM_SAMPLES; sample += 1) {
      warm.push(await measure(client, query.sql, query.params));
    }
    series[name] = { first: round(first), warm: summarize(warm) };
  }
  const budgets = Object.fromEntries(
    Object.entries(series).map(([name, values]) => [name, withinBudget(values)]),
  );
  result = {
    fixture,
    policy,
    limitations: "first is plan-cold after DISCARD PLANS; shared buffers and OS cache are not flushed",
    budgetMs: BUDGET_MS,
    withinBudget: Object.values(budgets).every(Boolean),
    budgets,
    series,
  };
  if (!result.withinBudget) exitCode = 1;
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end();
}
const accessCallsAfter = await readAccessFunctionCalls();
await statsClient.end();
result.accessFunctionCalls = {
  before: accessCallsBefore,
  after: accessCallsAfter,
  delta: accessCallsAfter - accessCallsBefore,
  policyProbeCalls: Object.keys(DICTIONARIES).length,
  schedulerSamples: Object.keys(result.series).length * (WARM_SAMPLES + 1),
};
result.accessFunctionCalls.perSchedulerSample =
  (result.accessFunctionCalls.delta - result.accessFunctionCalls.policyProbeCalls) /
  result.accessFunctionCalls.schedulerSamples;
if (
  result.accessFunctionCalls.perSchedulerSample !==
  result.fixture.registered_dictionaries
) {
  result.withinBudget = false;
  exitCode = 1;
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = exitCode;
