#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromUi = createRequire(path.join(repoRoot, "apps/ui/package.json"));
const { Client } = requireFromUi("pg");

export const NEXT_CARD_SELECTION_BUDGET_MS = Object.freeze({
  first: 2_000,
  warmP95: 1_000,
  warmMax: 2_000,
});

const connectionString = process.env.ISSUE_228_BENCHMARK_DB_URL;
if (!connectionString) throw new Error("ISSUE_228_BENCHMARK_DB_URL is required");
const target = new URL(connectionString);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  !target.pathname.toLowerCase().includes("issue228")
) {
  throw new Error("Issue #228 benchmark only accepts a loopback issue228 database");
}

const samples = 30;
const benchmarkUserId = "22800000-0000-0000-0000-000000000001";
const queries = {
  legacyRawPredicate: {
    sql: `select count(*) from word_entries entry
      where entry.is_nt2_2000
        and not private.is_pointer_only_dictionary_entry_v1(entry.raw)`,
    params: [],
  },
  indexedAntiJoin: {
    sql: `select count(*) from word_entries entry
      where entry.is_nt2_2000
        and not exists (
          select 1 from word_entries pointer_entry
          where pointer_entry.id = entry.id
            and private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
        )`,
    params: [],
  },
  fullScheduler: {
    sql: `select get_next_card(
      $1, $2::text[], array[]::uuid[], null, 'curated', 'both', 'new', array[]::text[]
    )`,
    params: [benchmarkUserId, ["word-to-definition"]],
  },
};

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
const measure = async (client, query) => {
  const startedAt = performance.now();
  await client.query(query.sql, query.params);
  return performance.now() - startedAt;
};

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
    benchmarkUserId,
  ]);
  const fixture = await client.query(
    `select count(*)::int as entries,
      pg_total_relation_size('word_entries')::int as relation_bytes,
      (select email from auth.users where id = $1) as qa_email
     from word_entries`,
    [benchmarkUserId],
  );
  if (fixture.rows[0].entries < 18_000) {
    throw new Error("Issue #228 benchmark requires at least 18,000 word entries");
  }
  if (fixture.rows[0].qa_email !== "test@2000nl.test") {
    throw new Error("Issue #228 benchmark requires exactly test@2000nl.test");
  }

  const series = {};
  for (const [name, query] of Object.entries(queries)) {
    await client.query("discard plans");
    const first = await measure(client, query);
    const warm = [];
    for (let index = 0; index < samples; index += 1) {
      warm.push(await measure(client, query));
    }
    series[name] = { first: round(first), warm: summarize(warm) };
  }

  const scheduler = series.fullScheduler;
  const withinBudget =
    scheduler.first <= NEXT_CARD_SELECTION_BUDGET_MS.first &&
    scheduler.warm.p95 <= NEXT_CARD_SELECTION_BUDGET_MS.warmP95 &&
    scheduler.warm.max <= NEXT_CARD_SELECTION_BUDGET_MS.warmMax;
  console.log(JSON.stringify({
    fixture: fixture.rows[0],
    limitations: "first is plan-cold after DISCARD PLANS; shared buffers and OS cache are not flushed",
    budgetMs: NEXT_CARD_SELECTION_BUDGET_MS,
    withinBudget,
    series,
  }, null, 2));
  if (!withinBudget) process.exitCode = 1;
} finally {
  await client.end();
}
