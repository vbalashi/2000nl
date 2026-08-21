import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MAX_LOOKUP_REQUESTS,
  FIXED_BENCHMARK_REQUESTS,
  MAX_TOTAL_REQUESTS,
  MAX_AUTH_USER_LIST_PAGES,
  PRODUCTION_AUTH_CACHE_TTL_MS,
  classifyAuthCacheSignal,
  createBoundedFetch,
  executeWithBoundedCleanup,
  fetchWithTimeout,
  parseArgs,
  verifyBenchmarkSessionOrRevoke,
  createBenchmarkRecoveryLease,
  resolveBenchmarkSupabaseUrl,
  persistBenchmarkSessionRecovery,
  findAuthUser,
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
  assert.equal(FIXED_BENCHMARK_REQUESTS, 6);
});

test("production benchmark rejects an unapproved Supabase origin before clients", () => {
  assert.throws(
    () => resolveBenchmarkSupabaseUrl("https://2000.dilum.io", "https://attacker.example"),
    /unapproved/i,
  );
  for (const invalid of [
    "http://user@127.0.0.1:3000/",
    "http://127.0.0.1:3000/evil",
    "http://127.0.0.1:3000/?x=1",
    "ftp://127.0.0.1:3000/",
  ]) {
    assert.throws(
      () => resolveBenchmarkSupabaseUrl(invalid, "http://127.0.0.1:54321"),
      /canonical HTTP\(S\)/i,
    );
  }
  assert.throws(
    () =>
      resolveBenchmarkSupabaseUrl(
        "http://127.0.0.1:3000",
        "http://127.0.0.1:54321/evil?x=1",
      ),
    /canonical HTTP\(S\)/i,
  );
  assert.equal(
    resolveBenchmarkSupabaseUrl("http://127.0.0.1:3000", "http://127.0.0.1:54321"),
    "http://127.0.0.1:54321",
  );
  assert.throws(
    () =>
      resolveBenchmarkSupabaseUrl(
        "http://127.0.0.1:3000",
        "https://unapproved.example",
      ),
    /loopback Supabase/i,
  );
  assert.throws(
    () =>
      resolveBenchmarkSupabaseUrl(
        "https://attacker.example",
        "https://lliwdcpuuzjmxyzrjtoz.supabase.co",
      ),
    /benchmark target/i,
  );
});

test("concurrent benchmark runs receive distinct protected recovery leases", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-recovery-leases-"));
  const first = createBenchmarkRecoveryLease(root);
  const second = createBenchmarkRecoveryLease(root);
  assert.notEqual(first, second);
  assert.equal(fs.statSync(first).mode & 0o777, 0o700);
  assert.equal(fs.statSync(second).mode & 0o777, 0o700);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a valid benchmark session receives durable recovery before long requests", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-valid-recovery-"));
  const recovery = persistBenchmarkSessionRecovery(
    { access_token: "valid-token", user: { id: "qa", email: "test@2000nl.test" } },
    root,
  );
  assert.equal(fs.statSync(recovery.directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(recovery.filename).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(recovery.filename)).session.access_token, "valid-token");
  fs.rmSync(root, { recursive: true, force: true });
});

test("QA identity lookup is bounded to one admin request", async () => {
  let calls = 0;
  const adminClient = {
    auth: {
      admin: {
        listUsers: async () => {
          calls += 1;
          return {
            data: {
              users: Array.from({ length: 1000 }, (_, index) => ({
                id: `other-${index}`,
                email: `other-${index}@example.test`,
              })),
            },
            error: null,
          };
        },
      },
    },
  };
  await assert.rejects(
    () => findAuthUser("test@2000nl.test", adminClient),
    /bounded_page/,
  );
  assert.equal(calls, MAX_AUTH_USER_LIST_PAGES);
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

test("principal mismatch revokes the just-minted benchmark session", async () => {
  const calls = [];
  await assert.rejects(
    () =>
      verifyBenchmarkSessionOrRevoke({
        session: {
          access_token: "mismatched-token",
          user: { id: "other-user", email: "test@2000nl.test" },
        },
        identity: { id: "qa-user", email: "test@2000nl.test" },
        adminClient: {
          auth: {
            admin: {
              signOut: async (...args) => {
                calls.push(args);
                return { error: null };
              },
            },
          },
        },
      }),
    /principal/i,
  );
  assert.deepEqual(calls, [["mismatched-token", "global"]]);
});

test("principal mismatch preserves recovery ownership when revocation fails", async () => {
  const preserved = [];
  await assert.rejects(
    () =>
      verifyBenchmarkSessionOrRevoke({
        session: {
          access_token: "mismatched-token",
          user: { id: "other-user", email: "test@2000nl.test" },
        },
        identity: { id: "qa-user", email: "test@2000nl.test" },
        adminClient: {
          auth: { admin: { signOut: async () => ({ error: new Error("revoke failed") }) } },
        },
        preserveRecoverySession: async (session) => preserved.push(session.access_token),
      }),
    /revocation_failed/,
  );
  assert.deepEqual(preserved, ["mismatched-token"]);
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
