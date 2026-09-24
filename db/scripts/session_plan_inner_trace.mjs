#!/usr/bin/env node

// One bounded, read-only production QA call. Raw psql output can contain SQL
// and learner data: only the summaries below may reach stdout or errors.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

const PROJECT_REF = "lliwdcpuuzjmxyzrjtoz";
const QA_EMAIL = "test@2000nl.test";

function connectionEnvironment(envFile) {
  const source = readFileSync(envFile, "utf8");
  const line = source.split(/\r?\n/).find((value) => value.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL missing from the selected environment file");
  const raw = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "aws-1-eu-west-1.pooler.supabase.com" ||
    url.port !== "6543" ||
    !decodeURIComponent(url.username).endsWith(`.${PROJECT_REF}`) ||
    url.pathname !== "/postgres"
  ) {
    throw new Error("Database URL does not identify the expected production transaction pooler");
  }
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port,
    PGDATABASE: "postgres",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: "require",
    PGCONNECT_TIMEOUT: "5",
  };
}

function balancedPlanJson(source, start) {
  for (let open = start; open < source.length; open += 1) {
    if (source[open] !== "[" && source[open] !== "{") continue;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = open; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') inString = true;
      else if (character === "[" || character === "{") stack.push(character);
      else if (character === "]" || character === "}") {
        if (stack.pop() !== (character === "]" ? "[" : "{")) break;
        if (stack.length > 0) continue;
        try {
          const value = JSON.parse(source.slice(open, index + 1));
          const plan = Array.isArray(value) ? value[0] : value;
          if (plan?.Plan) return { value: plan, end: index + 1 };
        } catch {
          // A SQL array or literal can precede the JSON plan.
        }
        break;
      }
    }
  }
  return null;
}

export function summarizeAutoExplain(output) {
  const notices = [];
  const pattern = /duration:\s*([\d.]+)\s*ms\s+plan:/g;
  const matches = [...output.matchAll(pattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const segment = output.slice(
      match.index + match[0].length,
      matches[index + 1]?.index ?? output.length,
    );
    const parsed = balancedPlanJson(segment, 0);
    if (!parsed) continue;
    const plan = parsed.value.Plan;
    if (!plan) continue;
    const notable = [];
    const walk = (node) => {
      if (["WindowAgg", "Sort", "HashAggregate", "Aggregate"].includes(node["Node Type"])) {
        notable.push({
          type: node["Node Type"],
          actualTotalMs: node["Actual Total Time"] ?? null,
          actualRows: node["Actual Rows"] ?? null,
          sharedHit: node["Shared Hit Blocks"] ?? null,
          tempRead: node["Temp Read Blocks"] ?? null,
          tempWritten: node["Temp Written Blocks"] ?? null,
        });
      }
      for (const child of node.Plans ?? []) walk(child);
    };
    walk(plan);
    notices.push({
      durationMs: Number(match[1]),
      rootType: plan["Node Type"],
      rootActualTotalMs: plan["Actual Total Time"] ?? null,
      rootActualRows: plan["Actual Rows"] ?? null,
      sharedHit: plan["Shared Hit Blocks"] ?? null,
      sharedRead: plan["Shared Read Blocks"] ?? null,
      tempRead: plan["Temp Read Blocks"] ?? null,
      tempWritten: plan["Temp Written Blocks"] ?? null,
      notable: notable.slice(0, 12),
    });
  }
  return notices;
}

function sql() {
  return `\\set ON_ERROR_STOP on
\\set QUIET on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '3000ms';
SET LOCAL jit = off;
SET LOCAL track_functions = 'all';
SET LOCAL client_min_messages = notice;
SET LOCAL auto_explain.log_level = notice;
SET LOCAL auto_explain.log_min_duration = '100ms';
SET LOCAL auto_explain.log_analyze = on;
SET LOCAL auto_explain.log_buffers = on;
SET LOCAL auto_explain.log_nested_statements = on;
SET LOCAL auto_explain.log_format = json;
DO $qa_identity$
DECLARE qa_user_id uuid;
BEGIN
  SELECT id INTO qa_user_id FROM auth.users WHERE email = '${QA_EMAIL}';
  IF qa_user_id IS NULL THEN RAISE EXCEPTION 'qa identity missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub', qa_user_id::text, true);
END
$qa_identity$;
SELECT 'trace_context=' || jsonb_build_object(
  'backendPid', pg_backend_pid(),
  'backendStart', (SELECT backend_start FROM pg_stat_activity WHERE pid = pg_backend_pid()),
  'serverVersion', current_setting('server_version'),
  'jit', current_setting('jit'),
  'autoExplainLevel', current_setting('auto_explain.log_level'),
  'autoExplainThreshold', current_setting('auto_explain.log_min_duration'),
  'autoExplainNested', current_setting('auto_explain.log_nested_statements'),
  'autoExplainFormat', current_setting('auto_explain.log_format')
)::text;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT public.get_training_session_plan(
  (SELECT id FROM auth.users WHERE email = '${QA_EMAIL}'),
  ARRAY['word-to-definition']::text[],
  NULL,
  'curated',
  'both',
  '{}'::jsonb
);
SELECT 'trace_functions=' || coalesce(jsonb_agg(jsonb_build_object(
  'signature', p.oid::regprocedure::text,
  'calls', f.calls,
  'totalMs', f.total_time,
  'selfMs', f.self_time
) ORDER BY f.total_time DESC), '[]'::jsonb)::text
FROM pg_stat_xact_user_functions f
JOIN pg_proc p ON p.oid = f.funcid
WHERE p.proname IN ('get_training_session_plan', 'training_scheduler_candidates_v2');
ROLLBACK;
`;
}

export function summarizeTrace(stdout, stderr) {
  const contextLine = stdout.split(/\r?\n/).find((line) => line.startsWith("trace_context="));
  const functionsLine = stdout.split(/\r?\n/).find((line) => line.startsWith("trace_functions="));
  const explain = balancedPlanJson(stdout, stdout.indexOf("trace_context="));
  if (!contextLine || !functionsLine || !explain) throw new Error("Incomplete trace output");
  const executionMs = explain.value["Execution Time"];
  if (!Number.isFinite(executionMs)) throw new Error("EXPLAIN execution time missing");
  const functions = JSON.parse(functionsLine.slice("trace_functions=".length));
  if (!functions.some((item) => /(?:^|\.)training_scheduler_candidates_v2\(/.test(item.signature) && item.calls > 0)) {
    throw new Error("Candidate helper function timing missing");
  }
  return {
    projectRef: PROJECT_REF,
    context: JSON.parse(contextLine.slice("trace_context=".length)),
    planningMs: explain.value["Planning Time"] ?? null,
    executionMs,
    functions,
    autoExplain: summarizeAutoExplain(stderr),
    noticeMetadata: {
      stderrBytes: stderr.length,
      durationMarkers: [...stderr.matchAll(/duration:\s*[\d.]+\s*ms/gi)].length,
      planMarkers: [...stderr.matchAll(/\bplan:/gi)].length,
      stdoutDurationMarkers: [...stdout.matchAll(/duration:\s*[\d.]+\s*ms/gi)].length,
    },
  };
}

function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--env-file") {
    throw new Error("Usage: node db/scripts/session_plan_inner_trace.mjs --env-file /private/path/.env.local");
  }
  const env = connectionEnvironment(process.argv[3]);
  const result = spawnSync("psql", ["-X", "--no-psqlrc", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], {
    input: sql(),
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 15_000,
  });
  if (result.status !== 0 || result.error || result.signal) {
    throw new Error(`Bounded read-only trace failed: ${result.signal ?? result.error?.code ?? `psql exit ${result.status}`}`);
  }
  process.stdout.write(`${JSON.stringify(summarizeTrace(result.stdout, result.stderr))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Trace failed"}\n`);
    process.exitCode = 1;
  }
}
