import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LOOKUP_REQUESTS,
  FIXED_BENCHMARK_REQUESTS,
  MAX_TOTAL_REQUESTS,
  PRODUCTION_AUTH_CACHE_TTL_MS,
  classifyAuthCacheSignal,
  createBoundedFetch,
  executeWithBoundedCleanup,
  fetchWithTimeout,
  parseArgs,
} from "./platform_exact_group_latency_benchmark.mjs";

test("production defaults expire the deployed auth cache and stay within the hard request cap", () => {
  const options = parseArgs([]);

  assert.ok(options.idleMs > PRODUCTION_AUTH_CACHE_TTL_MS);
  assert.equal(options.batches * options.samplesPerBatch, MAX_LOOKUP_REQUESTS);
  assert.equal(
    FIXED_BENCHMARK_REQUESTS + options.batches * options.samplesPerBatch,
    MAX_TOTAL_REQUESTS,
  );
  assert.equal(options.assertColdFirstSample, true);
});

test("classifies and records the intended auth cache signal", () => {
  assert.equal(classifyAuthCacheSignal({ "auth.get-user": 80 }), "cold");
  assert.equal(classifyAuthCacheSignal({ "auth.cache-hit": 1 }), "cache-hit");
  assert.equal(classifyAuthCacheSignal({}), "unknown");
});

test("every HTTP read receives a bounded abort signal", async () => {
  let observedSignal;
  await fetchWithTimeout("https://example.invalid", {}, async (_url, init) => {
    observedSignal = init.signal;
    return { ok: true };
  });

  assert.ok(observedSignal instanceof AbortSignal);
});

test("rejects request counts above the hard cap", () => {
  assert.throws(
    () => parseArgs(["--batches", "11", "--samples-per-batch", "5"]),
    /lookup_request_cap_exceeded/,
  );
});

test("rejects production pacing below the safe minimum", () => {
  assert.throws(
    () => parseArgs(["--idle-ms", "2000"]),
    /production_idle_pacing_too_fast/,
  );
  assert.throws(
    () => parseArgs(["--warm-spacing-ms", "0"]),
    /production_warm_pacing_too_fast/,
  );
});

test("allows fast pacing only for explicit loopback runs", () => {
  const options = parseArgs([
    "--base-url",
    "http://127.0.0.1:3000",
    "--allow-fast-local",
    "--idle-ms",
    "0",
    "--warm-spacing-ms",
    "0",
  ]);

  assert.equal(options.idleMs, 0);
  assert.equal(options.warmSpacingMs, 0);
  assert.throws(
    () =>
      parseArgs([
        "--base-url",
        "https://2000.dilum.io",
        "--allow-fast-local",
      ]),
    /fast_override_requires_loopback/,
  );

  const ipv6 = parseArgs([
    "--base-url",
    "http://[::1]:3000",
    "--allow-fast-local",
    "--idle-ms",
    "0",
    "--warm-spacing-ms",
    "0",
  ]);
  assert.equal(ipv6.baseUrl, "http://[::1]:3000");
});

test("lookup failure still attempts bounded revocation and never claims a timed-out cleanup", async () => {
  const events = [];
  let sessionRevoked = false;
  const hangingFetch = createBoundedFetch(10, (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), {
        once: true,
      });
    }),
  );

  await assert.rejects(
    executeWithBoundedCleanup({
      operation: async () => {
        events.push("lookup");
        throw new Error("lookup_timeout");
      },
      cleanup: async () => {
        events.push("revoke-attempt");
        await hangingFetch("https://supabase.invalid/auth/v1/logout");
        sessionRevoked = true;
      },
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.some((cause) => cause?.message === "lookup_timeout"),
  );

  assert.deepEqual(events, ["lookup", "revoke-attempt"]);
  assert.equal(sessionRevoked, false);
});

test("successful revocation completes before the original lookup error is reported", async () => {
  const events = [];
  let sessionRevoked = false;

  await assert.rejects(
    executeWithBoundedCleanup({
      operation: async () => {
        events.push("lookup");
        throw new Error("lookup_failed");
      },
      cleanup: async () => {
        events.push("revoke");
        sessionRevoked = true;
      },
    }),
    /lookup_failed/,
  );

  assert.deepEqual(events, ["lookup", "revoke"]);
  assert.equal(sessionRevoked, true);
});
