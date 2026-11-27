import "server-only";

export function managedTermsEnabled() {
  return Boolean(process.env.DILUM_SERVICE_TERMS_DIR) &&
    (process.env.DEPLOYMENT_ENV === "staging" || process.env.DILUM_SERVICE_TERMS_ENABLED === "true");
}
