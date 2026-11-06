import "server-only";
import {matchInterfaceLanguage} from "@/lib/i18n/registry";
import { createHealthSupabaseClient } from "@/lib/server/healthSupabase";
import {
  parseReleaseCatalog,
  releaseVersionPattern,
  type ReleaseCatalog,
} from "./appRelease";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

/** Public product notes only; service credentials and future-version bounds stay on the server. */
export async function readReleaseCatalog(
  version: string,
  language: OnboardingLanguage,
  limit = 5,
  before: string | null = null,
): Promise<ReleaseCatalog> {
  if (!releaseVersionPattern.test(version))
    return { items: [], nextVersion: null };
  const client = createHealthSupabaseClient();
  if (!client) return { items: [], nextVersion: null };
  // Editorial translations have a separate DB contract from interface languages.
  const catalogLocale = language === "ru" || language === "nl" ? language : "en";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const { data, error } = await client
      .rpc("read_app_release_notes_v1", {
        p_max_version: version,
        p_locale: catalogLocale,
        p_limit: limit,
        p_before_version: before,
      })
      .abortSignal(controller.signal);
    if (error) throw new Error("Release catalog unavailable");
    return parseReleaseCatalog(data);
  } finally {
    clearTimeout(timer);
  }
}
export const releaseLanguage = (
  value: string | null | undefined,
): OnboardingLanguage => (matchInterfaceLanguage(value) ?? "en");
