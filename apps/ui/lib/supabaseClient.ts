import { createClient } from "@supabase/supabase-js";
import { browserSupabaseConfig } from "./runtime/publicConfig";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const createMemoryStorage = (): StorageLike => {
  const store: Record<string, string> = {};

  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
};

const resolveAuthStorage = (): StorageLike => {
  if (typeof window === "undefined") {
    return createMemoryStorage();
  }

  try {
    const storage = window.localStorage;
    const probeKey = "__supabase_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return createMemoryStorage();
  }
};

const config = browserSupabaseConfig();
let supabaseUrl = config.url;
let supabaseAnonKey = config.anonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  // In tests we don't require real Supabase credentials.
  if (process.env.NODE_ENV === "test") {
    supabaseUrl = "http://localhost:54321";
    supabaseAnonKey = "test-anon-key";
  } else {
    throw new Error("Supabase credentials are not configured.");
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: true,
    storage: resolveAuthStorage(),
  },
});
