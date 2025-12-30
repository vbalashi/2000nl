import { createClient } from "@supabase/supabase-js";

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  auth: { detectSessionInUrl: true }
});
