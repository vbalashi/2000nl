export const serviceTermsVersion = "2026-11-27";
export const termsPath = "/legal/2026-11-27/terms.html";
export const privacyPath = "/legal/2026-11-27/privacy.html";

export function hasAcceptedTerms(metadata: Record<string, unknown> | undefined) {
  return metadata?.dilum_terms_version === serviceTermsVersion;
}
