import { supabase } from "@/lib/supabaseClient";

export async function platformV2AuthenticatedJsonHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}
