import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextResponse } from "next/server";

const getUser = vi.fn();
const createClient = vi.fn(() => ({ auth: { getUser } }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

function bearer(expiresInSeconds: number, subject = "user-1") {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${encode({ alg: "HS256" })}.${encode({ sub: subject, exp })}.signature`;
}

const requestWith = (token: string) =>
  new Request("http://localhost/api/platform/v2/actions", {
    headers: { authorization: `Bearer ${token}` },
  });

describe("getAuthenticatedSupabase cache", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.PLATFORM_AUTH_CACHE_IN_TESTS = "1";
    delete process.env.PLATFORM_FIRST_PARTY_AUTH_CACHE_TTL_MS;
    delete process.env.PLATFORM_AUTH_CACHE_TTL_MS;
    getUser.mockReset();
    createClient.mockClear();
    const { resetPlatformAuthCacheForTests } = await import(
      "@/lib/platform/serverSupabase"
    );
    resetPlatformAuthCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PLATFORM_AUTH_CACHE_IN_TESTS;
  });

  test("coalesces concurrent misses for one token into a single GoTrue call", async () => {
    const { getAuthenticatedSupabase } = await import("@/lib/platform/serverSupabase");
    let release!: () => void;
    getUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: { user: { id: "user-1" } }, error: null });
        }),
    );
    const token = bearer(3600);
    const first = getAuthenticatedSupabase(requestWith(token));
    const second = getAuthenticatedSupabase(requestWith(token));
    await vi.advanceTimersByTimeAsync(0);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(getUser).toHaveBeenCalledOnce();
    expect(a).not.toBeInstanceOf(NextResponse);
    expect(b).not.toBeInstanceOf(NextResponse);
    expect((b as { user: { id: string } }).user.id).toBe("user-1");
  });

  test("keeps a first-party principal for up to 60s", async () => {
    const { getAuthenticatedSupabase } = await import("@/lib/platform/serverSupabase");
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const token = bearer(3600);

    await getAuthenticatedSupabase(requestWith(token));
    vi.advanceTimersByTime(30_000);
    await getAuthenticatedSupabase(requestWith(token));
    expect(getUser).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(31_000);
    await getAuthenticatedSupabase(requestWith(token));
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  test("never caches a first-party principal past the token expiry", async () => {
    const { getAuthenticatedSupabase } = await import("@/lib/platform/serverSupabase");
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const token = bearer(20);

    await getAuthenticatedSupabase(requestWith(token));
    vi.advanceTimersByTime(16_000);
    await getAuthenticatedSupabase(requestWith(token));
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  test("does not share or cache a rejected token", async () => {
    const { getAuthenticatedSupabase } = await import("@/lib/platform/serverSupabase");
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    const token = bearer(3600);

    const [a, b] = await Promise.all([
      getAuthenticatedSupabase(requestWith(token)),
      getAuthenticatedSupabase(requestWith(token)),
    ]);
    expect(a).toBeInstanceOf(NextResponse);
    expect(b).toBeInstanceOf(NextResponse);
    expect((a as NextResponse).status).toBe(401);
    expect((b as NextResponse).status).toBe(401);
    await getAuthenticatedSupabase(requestWith(token));
    expect(getUser).toHaveBeenCalledTimes(3);
  });
});
