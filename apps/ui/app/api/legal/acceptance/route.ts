import { managedTermsEnabled } from "@/lib/legal/managedTerms";
import { getAuthenticatedUserSupabase, getPlatformServiceSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { hasAcceptedTerms, serviceTermsVersion } from "@/lib/legal/serviceTerms";
import { readSmallJson } from "@/lib/billing/readSmallJson";

export async function POST(request: Request) {
  if (!managedTermsEnabled()) return jsonNoStore({}, 404);
  const auth = await getAuthenticatedUserSupabase(request);
  if (auth instanceof Response) return auth;
  const body = await readSmallJson(request);
  if (!body || typeof body !== "object" || !("version" in body) || body.version !== serviceTermsVersion) {
    return jsonNoStore({ error: "terms_version_mismatch" }, 409);
  }
  if (!hasAcceptedTerms(auth.user.app_metadata)) {
    const service = getPlatformServiceSupabase();
    if (service instanceof Response) return service;
    const { error } = await service.supabase.auth.admin.updateUserById(auth.user.id, {
      app_metadata: { dilum_terms_version: serviceTermsVersion, dilum_terms_accepted_at: new Date().toISOString() },
    });
    if (error) return jsonNoStore({ error: "could_not_record_acceptance" }, 503);
  }
  return jsonNoStore({ userId: auth.user.id, version: serviceTermsVersion });
}
