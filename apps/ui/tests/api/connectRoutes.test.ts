import crypto from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const createClient = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

function sha256Base64Url(value: string) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function queryChain(result: { data?: unknown; error?: unknown }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

function mutationChain(result: { data?: unknown; error?: unknown } = { error: null }) {
  const query: any = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe("2000NL Connect API", () => {
  beforeEach(() => {
    vi.resetModules();
    createClient.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.CONNECT_API_ALLOWED_ORIGINS = "chrome-extension://abc";
  });

  test("approve creates a grant and returns an authorization-code redirect", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "user-1", email: "user@example.com" } },
      error: null,
    }));
    const inserts: Array<{ table: string; row: any }> = [];
    const upserts: Array<{ table: string; row: any }> = [];
    const serviceFrom = vi.fn((table: string) => {
      if (table === "connected_clients") {
        return queryChain({
          data: {
            client_id: "audiofilms_chrome",
            display_name: "AudioFilms",
            client_type: "chrome_extension",
            status: "active",
            allowed_redirect_uris: ["https://extension.chromiumapp.org/"],
            allowed_origins: ["chrome-extension://abc"],
            allowed_scopes: ["platform:read", "platform:write", "offline_access"],
            requires_pkce: true,
            client_secret_hash: null,
          },
          error: null,
        });
      }
      return {
        upsert: vi.fn((row: any) => {
          upserts.push({ table, row });
          return Promise.resolve({ error: null });
        }),
        insert: vi.fn((row: any) => {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        }),
      };
    });

    createClient
      .mockReturnValueOnce({ auth: { getUser } })
      .mockReturnValueOnce({ from: serviceFrom });

    const { POST } = await import("@/app/api/connect/authorize/approve/route");
    const response = await POST(
      new NextRequest("http://localhost/api/connect/authorize/approve", {
        method: "POST",
        headers: {
          authorization: "Bearer web-token",
          "content-type": "application/json",
          origin: "chrome-extension://abc",
        },
        body: JSON.stringify({
          clientId: "audiofilms_chrome",
          redirectUri: "https://extension.chromiumapp.org/",
          scope: "platform:read platform:write offline_access",
          state: "state-1",
          codeChallenge: "challenge-1",
          codeChallengeMethod: "S256",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://abc",
    );
    const payload = await response.json();
    const redirect = new URL(payload.redirectTo);
    expect(redirect.origin + redirect.pathname).toBe(
      "https://extension.chromiumapp.org/",
    );
    expect(redirect.searchParams.get("code")).toBeTruthy();
    expect(redirect.searchParams.get("state")).toBe("state-1");
    expect(upserts[0]).toMatchObject({
      table: "connected_client_grants",
      row: {
        client_id: "audiofilms_chrome",
        user_id: "user-1",
        scopes: ["platform:read", "platform:write", "offline_access"],
        revoked_at: null,
      },
    });
    expect(inserts[0]).toMatchObject({
      table: "connect_authorization_codes",
      row: {
        client_id: "audiofilms_chrome",
        user_id: "user-1",
        user_email: "user@example.com",
        redirect_uri: "https://extension.chromiumapp.org/",
        scopes: ["platform:read", "platform:write", "offline_access"],
        code_challenge: "challenge-1",
        code_challenge_method: "S256",
      },
    });
  });

  test("token exchanges an authorization code with PKCE", async () => {
    const verifier = "verifier-1";
    const code = "code-1";
    const session = {
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_at: 1781619999,
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "user-1", email: "user@example.com" },
    };
    const updates: Array<{ table: string; row: any }> = [];
    const inserts: Array<{ table: string; row: any }> = [];
    const serviceFrom = vi.fn((table: string) => {
      if (table === "connected_clients") {
        return queryChain({
          data: {
            client_id: "audiofilms_chrome",
            display_name: "AudioFilms",
            client_type: "chrome_extension",
            status: "active",
            allowed_redirect_uris: ["https://extension.chromiumapp.org/"],
            allowed_origins: ["chrome-extension://abc"],
            allowed_scopes: ["platform:read", "platform:write", "offline_access"],
            requires_pkce: true,
            client_secret_hash: null,
          },
          error: null,
        });
      }
      if (table === "connect_authorization_codes") {
        return {
          select: vi.fn(() =>
            queryChain({
              data: {
                code_hash: sha256Hex(code),
                client_id: "audiofilms_chrome",
                user_id: "user-1",
                user_email: "user@example.com",
                redirect_uri: "https://extension.chromiumapp.org/",
                scopes: ["platform:read", "platform:write", "offline_access"],
                code_challenge: sha256Base64Url(verifier),
                code_challenge_method: "S256",
                expires_at: new Date(Date.now() + 60_000).toISOString(),
                used_at: null,
              },
              error: null,
            }),
          ),
          update: vi.fn((row: any) => {
            updates.push({ table, row });
            return mutationChain();
          }),
        };
      }
      if (table === "connected_client_grants") {
        return {
          select: vi.fn(() =>
            queryChain({
              data: {
                client_id: "audiofilms_chrome",
                user_id: "user-1",
                scopes: ["platform:read", "platform:write", "offline_access"],
                revoked_at: null,
              },
              error: null,
            }),
          ),
          update: vi.fn((row: any) => {
            updates.push({ table, row });
            return mutationChain();
          }),
        };
      }
      if (table === "connected_client_sessions") {
        return {
          insert: vi.fn((row: any) => {
            inserts.push({ table, row });
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    createClient
      .mockReturnValueOnce({
        from: serviceFrom,
        auth: {
          admin: {
            generateLink: vi.fn(async () => ({
              data: { properties: { email_otp: "otp-1" } },
              error: null,
            })),
          },
        },
      })
      .mockReturnValueOnce({
        auth: {
          verifyOtp: vi.fn(async () => ({ data: { session }, error: null })),
        },
      });

    const { POST } = await import("@/app/api/connect/token/route");
    const response = await POST(
      new NextRequest("http://localhost/api/connect/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: "audiofilms_chrome",
          code,
          redirect_uri: "https://extension.chromiumapp.org/",
          code_verifier: verifier,
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_at: 1781619999,
      expires_in: 3600,
      token_type: "bearer",
      scope: "platform:read platform:write offline_access",
      user: { id: "user-1", email: "user@example.com" },
    });
    expect(inserts[0]).toMatchObject({
      table: "connected_client_sessions",
      row: {
        refresh_token_hash: sha256Hex("refresh-1"),
        client_id: "audiofilms_chrome",
        user_id: "user-1",
      },
    });
    expect(updates.some((item) => item.table === "connect_authorization_codes")).toBe(
      true,
    );
  });

  test("refresh requires a tracked active Connected Client Session", async () => {
    const refreshedSession = {
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_at: 1781620000,
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "user-1", email: "user@example.com" },
    };
    const updates: Array<{ table: string; row: any }> = [];
    const serviceFrom = vi.fn((table: string) => {
      if (table === "connected_clients") {
        return queryChain({
          data: {
            client_id: "audiofilms_chrome",
            display_name: "AudioFilms",
            client_type: "chrome_extension",
            status: "active",
            allowed_redirect_uris: ["https://extension.chromiumapp.org/"],
            allowed_origins: ["chrome-extension://abc"],
            allowed_scopes: ["platform:read", "platform:write", "offline_access"],
            requires_pkce: true,
            client_secret_hash: null,
          },
          error: null,
        });
      }
      if (table === "connected_client_sessions") {
        return {
          select: vi.fn(() =>
            queryChain({
              data: {
                refresh_token_hash: sha256Hex("refresh-1"),
                client_id: "audiofilms_chrome",
                user_id: "user-1",
                scopes: ["platform:read", "platform:write", "offline_access"],
                revoked_at: null,
              },
              error: null,
            }),
          ),
          update: vi.fn((row: any) => {
            updates.push({ table, row });
            return mutationChain();
          }),
        };
      }
      if (table === "connected_client_grants") {
        return {
          select: vi.fn(() =>
            queryChain({
              data: {
                client_id: "audiofilms_chrome",
                user_id: "user-1",
                scopes: ["platform:read", "platform:write", "offline_access"],
                revoked_at: null,
              },
              error: null,
            }),
          ),
          update: vi.fn((row: any) => {
            updates.push({ table, row });
            return mutationChain();
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    createClient
      .mockReturnValueOnce({ from: serviceFrom })
      .mockReturnValueOnce({
        auth: {
          refreshSession: vi.fn(async () => ({
            data: { session: refreshedSession },
            error: null,
          })),
        },
      });

    const { POST } = await import("@/app/api/connect/token/route");
    const response = await POST(
      new NextRequest("http://localhost/api/connect/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: "audiofilms_chrome",
          refresh_token: "refresh-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access_token: "access-2",
      refresh_token: "refresh-2",
      scope: "platform:read platform:write offline_access",
    });
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "connected_client_sessions",
          row: expect.objectContaining({
            refresh_token_hash: sha256Hex("refresh-2"),
          }),
        }),
      ]),
    );
  });
});
