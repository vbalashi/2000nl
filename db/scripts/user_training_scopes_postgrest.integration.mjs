#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function readLocalSupabaseEnvironment() {
  const result = spawnSync("supabase", ["status", "-o", "env"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_TELEMETRY_DISABLED: "1",
      DO_NOT_TRACK: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error("local_supabase_status_unavailable; start the local stack first");
  }

  return Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) return null;
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
      .filter((entry) => entry !== null),
  );
}

function validatedLocalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("local_supabase_api_url_invalid");
  }
  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
    throw new Error("refusing_non_loopback_supabase_api_url");
  }
  return url.origin;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("local_supabase_response_invalid");
  }
}

async function apiRequest(baseUrl, pathName, apiKey, bearer, options = {}) {
  const response = await fetch(new URL(pathName, baseUrl), {
    method: options.method ?? "GET",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.headers ?? {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

async function createUser(baseUrl, serviceKey, password, createdUsers) {
  const email = `scope-security-${randomUUID()}@example.invalid`;
  const response = await apiRequest(
    baseUrl,
    "/auth/v1/admin/users",
    serviceKey,
    serviceKey,
    {
      method: "POST",
      body: { email, password, email_confirm: true },
    },
  );
  if (!response.ok) {
    throw new Error(`local_auth_user_create_failed_${response.status}`);
  }
  const user = parseJson(response.text);
  if (typeof user.id !== "string") {
    throw new Error("local_auth_user_create_missing_id");
  }
  createdUsers.push(user.id);
  return { id: user.id, email, password };
}

async function signIn(baseUrl, anonKey, user) {
  const response = await apiRequest(
    baseUrl,
    "/auth/v1/token?grant_type=password",
    anonKey,
    anonKey,
    { method: "POST", body: { email: user.email, password: user.password } },
  );
  if (!response.ok) {
    throw new Error(`local_auth_password_signin_failed_${response.status}`);
  }
  const session = parseJson(response.text);
  if (typeof session.access_token !== "string") {
    throw new Error("local_auth_signin_missing_access_token");
  }
  return session.access_token;
}

async function expectDirectRequestDenied(
  baseUrl,
  label,
  pathName,
  apiKey,
  bearer,
  options,
  completed,
) {
  const result = await apiRequest(baseUrl, pathName, apiKey, bearer, options);
  assert.equal(
    [401, 403].includes(result.status),
    true,
    `${label} was not rejected for insufficient privileges`,
  );
  completed.push(label);
}

function assertMismatchedScopeDenied(result, label, completed) {
  assert.equal(result.status, 400, `${label} returned an unexpected status`);
  const error = parseJson(result.text);
  assert.equal(error.code, "P0001", `${label} returned an unexpected SQL error`);
  assert.equal(
    error.message,
    "unauthorized: user_id does not match authenticated user",
    `${label} did not reject the mismatched user identity`,
  );
  completed.push(label);
}

async function deleteUser(baseUrl, serviceKey, userId) {
  const response = await apiRequest(
    baseUrl,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    serviceKey,
    serviceKey,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`local_auth_user_cleanup_failed_${response.status}`);
  }
}

async function main() {
  const local = readLocalSupabaseEnvironment();
  const baseUrl = validatedLocalUrl(local.API_URL);
  const anonKey = local.ANON_KEY;
  const serviceKey = local.SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) {
    throw new Error("local_supabase_auth_keys_unavailable");
  }

  const createdUsers = [];
  const completed = [];
  try {
    const passwords = Array.from({ length: 4 }, () => `A9!${randomUUID()}x`);
    const users = [];
    for (const password of passwords) {
      users.push(await createUser(baseUrl, serviceKey, password, createdUsers));
    }
    const [owner, otherOwner, anonInsertTarget, authenticatedInsertTarget] = users;
    const [ownerToken, otherOwnerToken] = await Promise.all([
      signIn(baseUrl, anonKey, owner),
      signIn(baseUrl, anonKey, otherOwner),
    ]);

    for (const [label, user, token, filter, ratio] of [
      ["owner", owner, ownerToken, "new", 3],
      ["other owner", otherOwner, otherOwnerToken, "review", 5],
    ]) {
      const response = await apiRequest(
        baseUrl,
        "/rest/v1/rpc/update_active_training_scope",
        anonKey,
        token,
        {
          method: "POST",
          body: {
            p_user_id: user.id,
            p_language_code: "nl",
            p_card_filter: filter,
            p_new_review_ratio: ratio,
          },
        },
      );
      assert.equal(response.ok, true, `scoped update RPC failed for ${label}`);
      completed.push(`${label} scoped update RPC`);
    }

    const table = "/rest/v1/user_training_scopes";
    const ownerFilter = `?user_id=eq.${encodeURIComponent(owner.id)}&language_code=eq.nl`;
    const otherFilter = `?user_id=eq.${encodeURIComponent(otherOwner.id)}&language_code=eq.nl`;
    const anonHeaders = { Prefer: "return=minimal" };
    const write = (userId, languageCode = "nl") => ({
      user_id: userId,
      language_code: languageCode,
      card_filter: "both",
      modes_enabled: ["word-to-definition"],
      new_review_ratio: 2,
    });

    const directOperations = [
      ["SELECT", "GET", table + "?select=user_id&limit=1"],
      ["INSERT", "POST", table],
      ["UPDATE", "PATCH", table + otherFilter],
      ["DELETE", "DELETE", table + otherFilter],
    ];
    for (const [verb, method, pathName] of directOperations) {
      await expectDirectRequestDenied(
        baseUrl,
        `anonymous direct ${verb}`,
        pathName,
        anonKey,
        anonKey,
        {
          method,
          ...(method === "POST"
            ? { body: write(anonInsertTarget.id) }
            : method === "PATCH"
              ? { body: { card_filter: "new" } }
              : {}),
          headers: anonHeaders,
        },
        completed,
      );
    }

    for (const [verb, method, pathName] of [
      ["SELECT own", "GET", table + ownerFilter],
      ["SELECT other", "GET", table + otherFilter],
      ["INSERT", "POST", table],
      ["UPDATE other", "PATCH", table + otherFilter],
      ["DELETE other", "DELETE", table + otherFilter],
    ]) {
      await expectDirectRequestDenied(
        baseUrl,
        `authenticated direct ${verb}`,
        pathName,
        anonKey,
        ownerToken,
        {
          method,
          ...(method === "POST"
            ? { body: write(authenticatedInsertTarget.id) }
            : method === "PATCH"
              ? { body: { card_filter: "new" } }
              : {}),
          headers: anonHeaders,
        },
        completed,
      );
    }

    const anonRpc = await apiRequest(
      baseUrl,
      "/rest/v1/rpc/get_active_training_scope",
      anonKey,
      anonKey,
      { method: "POST", body: { p_user_id: owner.id, p_language_code: "nl" } },
    );
    assert.equal(
      [401, 403].includes(anonRpc.status),
      true,
      "anonymous scope RPC was not rejected for insufficient privileges",
    );
    completed.push("anonymous scope RPC denied");

    const crossUserRead = await apiRequest(
      baseUrl,
      "/rest/v1/rpc/get_active_training_scope",
      anonKey,
      ownerToken,
      {
        method: "POST",
        body: { p_user_id: otherOwner.id, p_language_code: "nl" },
      },
    );
    assertMismatchedScopeDenied(crossUserRead, "cross-user scope read RPC denied", completed);

    const crossUserWrite = await apiRequest(
      baseUrl,
      "/rest/v1/rpc/update_active_training_scope",
      anonKey,
      ownerToken,
      {
        method: "POST",
        body: {
          p_user_id: otherOwner.id,
          p_language_code: "nl",
          p_card_filter: "new",
          p_new_review_ratio: 1,
        },
      },
    );
    assertMismatchedScopeDenied(crossUserWrite, "cross-user scope write RPC denied", completed);

    const otherOwnerRead = await apiRequest(
      baseUrl,
      "/rest/v1/rpc/get_active_training_scope",
      anonKey,
      otherOwnerToken,
      { method: "POST", body: { p_user_id: otherOwner.id, p_language_code: "nl" } },
    );
    assert.equal(otherOwnerRead.ok, true, "owner scope read RPC failed");
    const scope = parseJson(otherOwnerRead.text);
    assert.equal(scope.card_filter, "review", "another user's scope changed");
    assert.equal(scope.new_review_ratio, 5, "another user's ratio changed");
    completed.push("owner read RPC and cross-user integrity");
  } finally {
    for (const userId of createdUsers.reverse()) {
      await deleteUser(baseUrl, serviceKey, userId);
    }
  }

  process.stdout.write(
    `PASS local Auth/PostgREST Training scope security (${completed.length} checks; temporary users deleted)\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_failure";
  process.stderr.write(`FAIL local Auth/PostgREST Training scope security: ${message}\n`);
  process.exitCode = 1;
});
