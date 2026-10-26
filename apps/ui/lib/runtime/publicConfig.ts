export type PublicRuntimeConfig = {
  schemaVersion: 1;
  environment: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

declare global {
  interface Window {
    __2000NL_RUNTIME_CONFIG__?: PublicRuntimeConfig;
  }
}

export function isPublicSupabaseKey(value: string): boolean {
  if (value.startsWith("sb_publishable_")) return value.length > 16;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const claims = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return claims.role === "anon";
  } catch {
    return false;
  }
}

export function validPublicConfig(value: unknown): value is PublicRuntimeConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as PublicRuntimeConfig;
  if (config.schemaVersion !== 1 || !["local", "legacy", "staging", "production"].includes(config.environment)) return false;
  if (typeof config.supabaseAnonKey !== "string" || !isPublicSupabaseKey(config.supabaseAnonKey)) return false;
  try {
    const url = new URL(config.supabaseUrl);
    return !url.username && !url.password && !url.search && !url.hash && (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  } catch {
    return false;
  }
}

// Dynamic access preserves server runtime settings rather than Next build inlining.
export function runtimeEnv(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

export function serverSupabaseConfig() {
  return {
    url: runtimeEnv("SUPABASE_URL") ?? runtimeEnv("PUBLIC_SUPABASE_URL") ?? runtimeEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: runtimeEnv("SUPABASE_ANON_KEY") ?? runtimeEnv("PUBLIC_SUPABASE_ANON_KEY") ?? runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function browserSupabaseConfig() {
  if (typeof window !== "undefined") {
    const config = window.__2000NL_RUNTIME_CONFIG__;
    if (config !== undefined) {
      if (!validPublicConfig(config)) throw new Error("Invalid public runtime configuration.");
      return { url: config.supabaseUrl, anonKey: config.supabaseAnonKey };
    }
    if (process.env.NEXT_PUBLIC_RUNTIME_CONFIG_REQUIRED === "true") {
      throw new Error("Public runtime configuration was not loaded.");
    }
    // Compatibility for the existing NUC build path until its migration.
    return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  }
  return serverSupabaseConfig();
}
