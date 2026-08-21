#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromUi = createRequire(path.join(repoRoot, "apps/ui/package.json"));
const { createClient } = requireFromUi("@supabase/supabase-js");
const {
  assertQaAccount,
  assertQaRequest,
  assertQaSessionPrincipal,
  assertProductionSupabaseUrl,
  parseQaEmailList,
} = requireFromUi("./lib/server/qaIdentityPolicy.js");
const { preserveQaRecoverySession } = requireFromUi("./lib/server/qaSessionRecovery.js");

export const MAX_LOOKUP_REQUESTS = 50;
export const FIXED_BENCHMARK_REQUESTS = 6;
export const MAX_AUTH_USER_LIST_PAGES = 1;
export const MAX_TOTAL_REQUESTS = FIXED_BENCHMARK_REQUESTS + MAX_LOOKUP_REQUESTS;
export const PRODUCTION_AUTH_CACHE_TTL_MS = 5_000;
export const PRODUCTION_MIN_IDLE_MS = 6_000;
export const PRODUCTION_MIN_WARM_SPACING_MS = 150;
export const REQUEST_TIMEOUT_MS = 15_000;

let options = null;
const rows = [];
let sessionRevoked = false;
let accessToken = null;
let benchmarkIdentity = null;
let deploymentIdentity = null;
let admin = null;
let publicClient = null;
const benchmarkRecoveryRoot = path.join(repoRoot, "tmp");
let benchmarkRecoveryDir = null;
let benchmarkRecoveryPath = null;

async function main(argv = process.argv.slice(2)) {
  options = parseArgs(argv);
  const hostname = new URL(options.baseUrl).hostname.replace(/^\[|\]$/g, "");
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const supabaseUrl = resolveBenchmarkSupabaseUrl(
    options.baseUrl,
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  );
  const allowedEmails = parseQaEmailList(
    loopback
      ? process.env.QA_TEST_USER_EMAIL_ALLOWLIST || options.email
      : requiredEnv("QA_TEST_USER_EMAIL_ALLOWLIST"),
  );
  const referenceEmails = parseQaEmailList(
    loopback ? process.env.QA_REFERENCE_USER_EMAILS : requiredEnv("QA_REFERENCE_USER_EMAILS"),
  );
  const qaRequest = assertQaRequest({
    requestedEmail: options.email,
    allowedEmails,
    referenceEmails,
  });
  options.email = qaRequest.email;
  const boundedSupabaseFetch = createBoundedFetch();
  admin = createClient(
    supabaseUrl,
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: boundedSupabaseFetch },
    },
  );
  publicClient = createClient(
    supabaseUrl,
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: boundedSupabaseFetch },
    },
  );

  await executeWithBoundedCleanup({
    operation: async () => {
      deploymentIdentity = await readDeploymentIdentity();
      accessToken = await mintSession(options.email);
      benchmarkIdentity = await discoverIdentity();
      await runSamples(benchmarkIdentity);
    },
    cleanup: async () => {
      if (!accessToken) return;
      const result = await admin.auth.admin.signOut(accessToken, "local");
      if (result.error) throw new Error("benchmark_session_revocation_failed");
      sessionRevoked = true;
      if (benchmarkRecoveryPath && fs.existsSync(benchmarkRecoveryPath)) {
        fs.unlinkSync(benchmarkRecoveryPath);
        fs.rmdirSync(benchmarkRecoveryDir);
        benchmarkRecoveryPath = null;
        benchmarkRecoveryDir = null;
      }
    },
  });

  const summary = buildSummary();
  writeOutput(options.output, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  writeOutput(options.summaryOutput, JSON.stringify(summary, null, 2) + "\n");
  if (!options.summaryOutput) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

async function mintSession(email) {
  const account = await findAuthUser(email);
  const identity = assertQaAccount(account, email);
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const verified = await publicClient.auth.verifyOtp({
    email,
    token: link.data.properties.email_otp,
    type: "email",
  });
  if (verified.error || !verified.data.session) {
    throw verified.error ?? new Error("benchmark_session_missing");
  }
  accessToken = verified.data.session.access_token;
  await verifyBenchmarkSessionOrRevoke({
    session: verified.data.session,
    identity,
    adminClient: admin,
    preserveRecoverySession: async (session) => {
      benchmarkRecoveryDir ??= createBenchmarkRecoveryLease(benchmarkRecoveryRoot);
      benchmarkRecoveryPath = preserveQaRecoverySession(benchmarkRecoveryDir, session);
    },
  });
  if (!benchmarkRecoveryPath) {
    const recovery = persistBenchmarkSessionRecovery(
      verified.data.session,
      benchmarkRecoveryRoot,
    );
    benchmarkRecoveryDir = recovery.directory;
    benchmarkRecoveryPath = recovery.filename;
  }
  return accessToken;
}

export function resolveBenchmarkSupabaseUrl(baseUrl, configuredSupabaseUrl) {
  const target = canonicalOriginUrl(baseUrl, "benchmark target");
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (loopback) {
    const supabase = canonicalOriginUrl(configuredSupabaseUrl, "Supabase");
    const supabaseHostname = supabase.hostname.replace(/^\[|\]$/g, "");
    if (!["localhost", "127.0.0.1", "::1"].includes(supabaseHostname)) {
      throw new Error("Local benchmark requires a loopback Supabase origin.");
    }
    return configuredSupabaseUrl;
  }
  if (
    target.origin !== "https://2000.dilum.io" ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error("Production benchmark target is not approved.");
  }
  return assertProductionSupabaseUrl(configuredSupabaseUrl);
}

function canonicalOriginUrl(value, label) {
  const parsed = new URL(value);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be a canonical HTTP(S) origin-only URL.`);
  }
  return parsed;
}

export function createBenchmarkRecoveryLease(rootDirectory = benchmarkRecoveryRoot) {
  fs.mkdirSync(rootDirectory, { recursive: true, mode: 0o700 });
  const directory = fs.mkdtempSync(path.join(rootDirectory, "platform-benchmark-qa-recovery-"));
  fs.chmodSync(directory, 0o700);
  return directory;
}

export function persistBenchmarkSessionRecovery(session, rootDirectory = benchmarkRecoveryRoot) {
  const directory = createBenchmarkRecoveryLease(rootDirectory);
  const filename = preserveQaRecoverySession(directory, session);
  return { directory, filename };
}

export async function verifyBenchmarkSessionOrRevoke({
  session,
  identity,
  adminClient,
  preserveRecoverySession,
}) {
  try {
    assertQaSessionPrincipal(session, identity);
  } catch (principalError) {
    const revoked = await adminClient.auth.admin.signOut(session.access_token, "global");
    if (revoked.error) {
      let recoveryError = null;
      try {
        await preserveRecoverySession?.(session);
      } catch (error) {
        recoveryError = error;
      }
      throw new AggregateError(
        [principalError, revoked.error, ...(recoveryError ? [recoveryError] : [])],
        "benchmark_principal_mismatch_and_revocation_failed",
      );
    }
    throw principalError;
  }
}

export async function findAuthUser(email, adminClient = admin) {
  const perPage = 1000;
  for (let page = 1; page <= MAX_AUTH_USER_LIST_PAGES; page += 1) {
    const result = await adminClient.auth.admin.listUsers({ page, perPage });
    if (result.error) throw result.error;
    const users = result.data?.users ?? [];
    const found = users.find((user) => String(user.email ?? "").trim().toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) return null;
  }
  throw new Error("benchmark_qa_identity_not_found_within_bounded_page");
}

async function readDeploymentIdentity() {
  const response = await fetchWithTimeout(`${options.baseUrl}/api/health`, {
    headers: { "x-request-id": crypto.randomUUID() },
  });
  const payload = await response.json();
  if (!response.ok || typeof payload.version !== "string" || typeof payload.commit !== "string") {
    throw new Error("deployment_identity_unavailable");
  }
  return { version: payload.version, commit: payload.commit };
}

async function discoverIdentity() {
  const response = await fetchWithTimeout(`${options.baseUrl}/api/platform/v2/catalog/lookup`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requiredEnv("PLATFORM_CATALOG_ACCESS_TOKEN")}`,
      "content-type": "application/json",
      "x-request-id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      query: options.query,
      contentLanguageCode: options.contentLanguageCode,
      translationTargetLanguageCode: options.translationTargetLanguageCode,
      cardTypeId: options.cardTypeId,
      intent: "dictionary-lookup",
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`catalog_discovery_failed_${response.status}`);
  const group = payload.groups?.find((candidate) =>
    candidate.entries?.some((entry) => entry.kind === "sense-card"),
  );
  const entry = group?.entries?.find((candidate) => candidate.kind === "sense-card");
  if (!group?.headwordGroupId || !entry?.entryId) {
    throw new Error("catalog_discovery_identity_missing");
  }
  return {
    entryId: entry.entryId,
    headwordGroupId: group.headwordGroupId,
  };
}

async function runSamples(identity) {
  for (let batch = 0; batch < options.batches; batch += 1) {
    await sleep(options.idleMs);
    for (let sample = 0; sample < options.samplesPerBatch; sample += 1) {
      if (sample > 0) await sleep(options.warmSpacingMs);
      const row = await runLookup(identity, batch, sample);
      if (sample === 0 && options.assertColdFirstSample && row.authCacheSignal !== "cold") {
        throw new Error(`idle_sample_not_auth_cold_batch_${batch}`);
      }
      rows.push(row);
    }
  }
}

async function runLookup(identity, batch, sample) {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const response = await fetchWithTimeout(`${options.baseUrl}/api/platform/v2/lookup`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      entryId: identity.entryId,
      contentLanguageCode: options.contentLanguageCode,
      translationTargetLanguageCode: options.translationTargetLanguageCode,
      cardTypeId: options.cardTypeId,
      intent: "training-review",
    }),
  });
  const headersAt = performance.now();
  const payload = await response.json();
  const endedAt = performance.now();
  if (!response.ok) throw new Error(`exact_lookup_failed_${response.status}`);
  const returnedGroup = payload.groups?.find((group) =>
    group.entries?.some((entry) => entry.entryId === identity.entryId),
  );
  if (returnedGroup?.headwordGroupId !== identity.headwordGroupId) {
    throw new Error("exact_lookup_identity_changed");
  }
  const serverTiming = parseServerTiming(response.headers.get("server-timing"));
  return {
    schemaVersion: "platform-exact-group-latency-row-v1",
    observedAt: new Date().toISOString(),
    kind: sample === 0 ? "idle" : "warm",
    batch,
    sample,
    status: response.status,
    totalMs: round(endedAt - startedAt),
    ttfbMs: round(headersAt - startedAt),
    transferMs: round(endedAt - headersAt),
    requestId: response.headers.get("x-request-id") ?? requestId,
    serverTiming,
    authCacheSignal: classifyAuthCacheSignal(serverTiming),
    contractVersion: payload.contractVersion,
    entryId: identity.entryId,
    headwordGroupId: returnedGroup.headwordGroupId,
  };
}

function buildSummary() {
  const idle = rows.filter((row) => row.kind === "idle");
  const warm = rows.filter((row) => row.kind === "warm");
  return {
    schemaVersion: "platform-exact-group-latency-summary-v1",
    baseUrl: options.baseUrl,
    deployment: deploymentIdentity,
    principalEmail: options.email,
    requestCount: rows.length,
    identity: benchmarkIdentity,
    policy: {
      batches: options.batches,
      samplesPerBatch: options.samplesPerBatch,
      idleMs: options.idleMs,
      warmSpacingMs: options.warmSpacingMs,
      authCacheTtlMs: PRODUCTION_AUTH_CACHE_TTL_MS,
      assertColdFirstSample: options.assertColdFirstSample,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      maxLookupRequests: MAX_LOOKUP_REQUESTS,
      maxTotalRequests: MAX_TOTAL_REQUESTS,
    },
    sessionRevoked,
    idle: summarize(idle),
    warm: summarize(warm),
    all: summarize(rows),
    outliers: rows.filter((row) => row.totalMs > 1_000).map(classifyOutlier),
    requestIds: rows.map((row) => row.requestId),
  };
}

function summarize(input) {
  const timingNames = [...new Set(input.flatMap((row) => Object.keys(row.serverTiming)))];
  return {
    total: stats(input.map((row) => row.totalMs)),
    ttfb: stats(input.map((row) => row.ttfbMs)),
    transfer: stats(input.map((row) => row.transferMs)),
    timings: Object.fromEntries(
      timingNames.map((name) => [
        name,
        stats(input.map((row) => row.serverTiming[name]).filter(Number.isFinite)),
      ]),
    ),
  };
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return { count: 0, p50: null, p95: null, max: null };
  const at = (ratio) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  return { count: sorted.length, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1)) };
}

function classifyOutlier(row) {
  return {
    kind: row.kind,
    batch: row.batch,
    sample: row.sample,
    totalMs: row.totalMs,
    requestId: row.requestId,
    dominant: Object.entries(row.serverTiming)
      .filter(([, value]) => Number.isFinite(value))
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4),
  };
}

function parseServerTiming(value) {
  return Object.fromEntries(
    String(value ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...parameters] = part.split(";");
        const duration = parameters.find((parameter) => parameter.startsWith("dur="));
        return [name, duration ? Number(duration.slice(4)) : null];
      }),
  );
}

export function parseArgs(argv) {
  const parsed = {
    baseUrl: "https://2000.dilum.io",
    email: "test@2000nl.test",
    query: "huis",
    contentLanguageCode: "nl",
    translationTargetLanguageCode: "ru",
    cardTypeId: "word-to-definition",
    batches: 10,
    samplesPerBatch: 5,
    idleMs: PRODUCTION_MIN_IDLE_MS,
    warmSpacingMs: 150,
    allowFastLocal: false,
    assertColdFirstSample: true,
    output: null,
    summaryOutput: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`missing_value_for_${arg}`);
      return argv[index];
    };
    if (arg === "--base-url") parsed.baseUrl = next().replace(/\/+$/, "");
    else if (arg === "--email") parsed.email = next();
    else if (arg === "--query") parsed.query = next();
    else if (arg === "--batches") parsed.batches = positiveInt(next(), arg);
    else if (arg === "--samples-per-batch") parsed.samplesPerBatch = positiveInt(next(), arg);
    else if (arg === "--idle-ms") parsed.idleMs = nonNegativeInt(next(), arg);
    else if (arg === "--warm-spacing-ms") parsed.warmSpacingMs = nonNegativeInt(next(), arg);
    else if (arg === "--allow-fast-local") parsed.allowFastLocal = true;
    else if (arg === "--output") parsed.output = next();
    else if (arg === "--summary-output") parsed.summaryOutput = next();
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node db/scripts/platform_exact_group_latency_benchmark.mjs [--batches 10] [--samples-per-batch 5] [--idle-ms 6000] [--warm-spacing-ms 150] [--query huis] [--output rows.jsonl] [--summary-output summary.json]\n",
      );
      process.exit(0);
    } else throw new Error(`unknown_argument_${arg}`);
  }
  const requestCount = parsed.batches * parsed.samplesPerBatch;
  const totalRequestCount = requestCount + FIXED_BENCHMARK_REQUESTS;
  if (!Number.isSafeInteger(totalRequestCount) || totalRequestCount > MAX_TOTAL_REQUESTS) {
    throw new Error("lookup_request_cap_exceeded");
  }
  const hostname = new URL(parsed.baseUrl).hostname.replace(/^\[|\]$/g, "");
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (parsed.allowFastLocal && !loopback) throw new Error("fast_override_requires_loopback");
  if (!parsed.allowFastLocal && parsed.idleMs < PRODUCTION_MIN_IDLE_MS) {
    throw new Error("production_idle_pacing_too_fast");
  }
  if (!parsed.allowFastLocal && parsed.warmSpacingMs < PRODUCTION_MIN_WARM_SPACING_MS) {
    throw new Error("production_warm_pacing_too_fast");
  }
  return parsed;
}

export function classifyAuthCacheSignal(serverTiming) {
  if (Number.isFinite(serverTiming["auth.cache-hit"])) return "cache-hit";
  if (
    Number.isFinite(serverTiming["auth.get-user"]) ||
    Number.isFinite(serverTiming["auth.principal-session"])
  ) {
    return "cold";
  }
  return "unknown";
}

export function fetchWithTimeout(url, init = {}, fetchImpl = fetch) {
  return createBoundedFetch(REQUEST_TIMEOUT_MS, fetchImpl)(url, init);
}

export function createBoundedFetch(timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = fetch) {
  return (input, init = {}) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const inputSignal = init.signal ?? (input instanceof Request ? input.signal : null);
    const signal = inputSignal
      ? AbortSignal.any([inputSignal, timeoutSignal])
      : timeoutSignal;
    return fetchImpl(input, { ...init, signal });
  };
}

export async function executeWithBoundedCleanup({ operation, cleanup }) {
  let operationError = null;
  try {
    await operation();
  } catch (error) {
    operationError = error;
  }

  try {
    await cleanup();
  } catch (cleanupError) {
    throw new AggregateError(
      operationError ? [operationError, cleanupError] : [cleanupError],
      "benchmark_cleanup_failed",
    );
  }
  if (operationError) throw operationError;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_${name}`);
  return value;
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`invalid_${name}`);
  return parsed;
}

function nonNegativeInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid_${name}`);
  return parsed;
}

function writeOutput(filename, contents) {
  if (!filename) return;
  const absolute = path.resolve(filename);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, contents, "utf8");
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
