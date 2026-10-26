import { afterEach, describe, expect, it, vi } from "vitest";
import { browserSupabaseConfig, serverSupabaseConfig, isPublicSupabaseKey } from "@/lib/runtime/publicConfig";
import { publicConfigScript, publicRuntimeConfig } from "@/lib/runtime/serverPublicConfig";
import { GET } from "@/app/runtime-config.js/route";

const config = { schemaVersion: 1 as const, environment: "production", supabaseUrl: "https://supabase.example.com", supabaseAnonKey: "sb_publishable_test_public_key" };
afterEach(() => { delete window.__2000NL_RUNTIME_CONFIG__; vi.unstubAllEnvs(); });

describe("runtime environment isolation", () => {
  it("preserves the existing legacy browser build path", () => {
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_CONFIG_REQUIRED", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://legacy.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-public-key");
    expect(browserSupabaseConfig()).toEqual({ url: "https://legacy.example.com", anonKey: "legacy-public-key" });
  });
  it("uses browser bootstrap instead of stale build settings", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://staging.example.com");
    window.__2000NL_RUNTIME_CONFIG__ = config;
    expect(browserSupabaseConfig()).toEqual({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey });
  });
  it("fails closed when a portable browser build has no bootstrap", () => {
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_CONFIG_REQUIRED", "true");
    expect(() => browserSupabaseConfig()).toThrow("was not loaded");
  });
  it("server calls use the runtime internal endpoint", () => {
    vi.stubEnv("SUPABASE_URL", "http://api-gw:8000");
    vi.stubEnv("SUPABASE_ANON_KEY", "server-public-key");
    expect(serverSupabaseConfig()).toEqual({ url: "http://api-gw:8000", anonKey: "server-public-key" });
  });
  it("never exposes service secrets or internal network endpoints", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", config.supabaseUrl);
    vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", config.supabaseAnonKey);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-stay-secret");
    vi.stubEnv("SUPABASE_URL", "http://api-gw:8000");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.text();
    expect(body).not.toContain("must-stay-secret");
    expect(body).not.toContain("api-gw");
    expect(Object.keys(publicRuntimeConfig()!)).toEqual(["schemaVersion", "environment", "supabaseUrl", "supabaseAnonKey"]);
  });
  it("rejects privileged keys even when assigned to the public variable", () => {
    expect(isPublicSupabaseKey("sb_secret_do_not_publish")).toBe(false);
    const payload = btoa(JSON.stringify({ role: "service_role" }));
    expect(isPublicSupabaseKey(`header.${payload}.signature`)).toBe(false);
    vi.stubEnv("PUBLIC_SUPABASE_URL", config.supabaseUrl);
    vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", `header.${payload}.signature`);
    expect(GET().status).toBe(503);
  });
  it("escapes executable HTML and rejects invalid browser configuration", () => {
    expect(publicConfigScript({ ...config, supabaseAnonKey: "</script>" })).not.toContain("</script>");
    window.__2000NL_RUNTIME_CONFIG__ = { ...config, supabaseUrl: "javascript:alert(1)" };
    expect(() => browserSupabaseConfig()).toThrow("Invalid");
  });
});
