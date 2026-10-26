import { supabase } from "@/lib/supabaseClient";
/** Capture a token for the expected account; do not let a later account switch retarget a save. */
export async function authenticatedAccountRequest(
  url: string,
  userId: string,
  init: RequestInit,
): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId)
    throw new Error("Account unavailable");
  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session.access_token}`,
    },
  });
}
