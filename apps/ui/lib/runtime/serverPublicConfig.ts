import "server-only";
import { runtimeEnv, validPublicConfig, type PublicRuntimeConfig } from "./publicConfig";

export function publicRuntimeConfig(): PublicRuntimeConfig | null {
  // Explicit allowlist: no process environment object or server/service key is serialized.
  const value = {
    schemaVersion: 1,
    environment: runtimeEnv("DEPLOYMENT_ENV") ?? "legacy",
    supabaseUrl: runtimeEnv("PUBLIC_SUPABASE_URL") ?? runtimeEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: runtimeEnv("PUBLIC_SUPABASE_ANON_KEY") ?? runtimeEnv("SUPABASE_ANON_KEY") ?? runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
  return validPublicConfig(value) ? value : null;
}

export function publicConfigScript(config: PublicRuntimeConfig): string {
  const serialized = JSON.stringify(config).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `window.__2000NL_RUNTIME_CONFIG__=Object.freeze(${serialized});`;
}
