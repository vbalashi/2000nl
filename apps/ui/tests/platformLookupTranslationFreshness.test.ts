import { expect, test, vi } from "vitest";
import { resolveLookupTranslationContext } from "@/lib/platform/translationService";
import { dictionaryMeaningTranslationIdentity } from "@/lib/translation/dictionaryMeaningTranslationIdentity";

const entry = { id: "entry", headword: "huis", language_code: "nl", raw: { meanings: [{ definition: "een gebouw", examples: ["Ik woon hier."] }] } };

test.each(["prompt", "source", "missing-example", "current"])("legacy lookup checks %s without starting a provider or queue", async variant => {
  const identity = await dictionaryMeaningTranslationIdentity({ wordEntryId: entry.id, word: entry, dbLang: "ru", provider: "openai" });
  const row = {
    id: "translation", word_entry_id: entry.id, status: "ready",
    source_content_revision: variant === "source" ? "old-source" : identity.sourceContentRevision,
    translation_policy_version: variant === "prompt" ? "old-prompt" : identity.policyVersion,
    overlay: { headword: "дом", meanings: [{ definition: "здание", examples: variant === "missing-example" ? [] : ["Я живу здесь."] }] },
  };
  const query = (data: unknown): any => {
    const q: any = { select: () => q, eq: () => q, in: () => q, maybeSingle: async () => ({ data, error: null }), then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
    return q;
  };
  const rpc = vi.fn();
  const result = await resolveLookupTranslationContext(
    { supabase: { from: () => query({ translation_lang: "ru" }), rpc }, user: { id: "user" } } as never,
    { supabase: { from: () => query([row]), rpc } } as never, [entry],
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const artifact = result.artifactsByEntryId.get(entry.id)!;
  expect(artifact.metadata.status).toBe(variant === "current" ? "ready" : "not_available");
  if (variant !== "current") expect(artifact.overlay).toBeUndefined();
  expect(rpc).not.toHaveBeenCalled();
});
