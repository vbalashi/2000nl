import { supabase } from "@/lib/supabaseClient";

export async function authenticatedJsonHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

export const platformV2AuthenticatedJsonHeaders = authenticatedJsonHeaders;
