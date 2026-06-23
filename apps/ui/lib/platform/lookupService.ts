export type DictionaryLookupPayload = {
  id: string;
  dictionary_id?: string | null;
  language_code?: string | null;
  headword: string;
  meaning_id?: number | null;
  part_of_speech?: string | null;
  gender?: string | null;
  raw: unknown;
  is_nt2_2000?: boolean | null;
  meanings_count?: number | null;
  dictionary?: DictionaryMetadataRow | null;
  dictionary_name?: string | null;
  dictionary_slug?: string | null;
  dictionary_kind?: string | null;
  search_match_group?: string | null;
  search_matched_text?: string | null;
};

export type DictionaryMetadataRow = {
  id: string;
  language_code: string;
  slug: string;
  name: string;
  kind: string;
  visibility: string;
  owner_user_id?: string | null;
  is_editable?: boolean | null;
  schema_key: string | null;
  schema_version: number | null;
};

export function lookupMatchRelation(
  entry: DictionaryLookupPayload,
  query: string,
) {
  const group = entry.search_match_group;
  if (group === "exact-headword") return "exact";
  if (group === "lemma-or-inflection") return "inflection";
  if (
    entry.headword.trim().toLocaleLowerCase() ===
    query.trim().toLocaleLowerCase()
  ) {
    return "exact";
  }
  return "unknown";
}

export function lookupMatchedForm(
  entry: DictionaryLookupPayload,
  query: string,
) {
  if (entry.search_matched_text) return entry.search_matched_text;
  if (entry.search_match_group === "lemma-or-inflection") return query;
  if (lookupMatchRelation(entry, query) === "exact") return entry.headword;
  return undefined;
}

export function dictionarySummaryFromLookupPayload(
  entry: DictionaryLookupPayload,
) {
  const dictionary = entry.dictionary ?? null;
  if (dictionary) {
    return {
      id: dictionary.id,
      languageCode: dictionary.language_code,
      slug: dictionary.slug,
      name: dictionary.name,
      kind: dictionary.kind,
      visibility: dictionary.visibility,
      schemaKey: dictionary.schema_key,
      schemaVersion: dictionary.schema_version,
      isEditable: dictionary.is_editable ?? null,
    };
  }

  if (!entry.dictionary_id) return null;
  return {
    id: entry.dictionary_id,
    languageCode: entry.language_code ?? null,
    slug: entry.dictionary_slug ?? "",
    name: entry.dictionary_name ?? "",
    kind: entry.dictionary_kind ?? "curated",
    visibility: "system",
    schemaKey: null,
    schemaVersion: null,
    isEditable: null,
  };
}

export function dictionaryCanBeEditedByUser(
  entry: DictionaryLookupPayload,
  userId: string,
) {
  const dictionary = entry.dictionary ?? null;
  return (
    dictionary?.kind === "user" &&
    dictionary.is_editable === true &&
    dictionary.owner_user_id === userId
  );
}
