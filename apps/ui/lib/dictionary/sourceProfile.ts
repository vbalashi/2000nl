import defaults from "../../../../packages/shared/dictionary-source/defaults.json";

export type DictionarySourceProfile = typeof defaults;

/** Display/catalog compatibility settings only; never put credentials here. */
export function dictionarySourceProfile(): DictionarySourceProfile {
  const configured = process.env.NEXT_PUBLIC_DICTIONARY_SOURCE_PROFILE;
  if (configured === undefined) return defaults;
  let parsed: unknown;
  try { parsed = JSON.parse(configured); } catch { throw new Error("invalid_dictionary_source_profile"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_dictionary_source_profile");
  const entries = Object.entries(parsed);
  if (entries.some(([key, value]) => !Object.hasOwn(defaults, key) || typeof value !== "string" || !value.trim() || value.length > 500)) {
    throw new Error("invalid_dictionary_source_profile");
  }
  const profile = { ...defaults, ...parsed };
  if (!/^[a-z_][a-z0-9_]*$/.test(profile.sourceRankColumn)) throw new Error("invalid_dictionary_source_profile");
  return profile;
}

export function isDictionarySourceList(list: {type?: string; name: string} | null | undefined): boolean {
  return Boolean(list && list.type === "curated" && list.name.trim().toLowerCase() === dictionarySourceProfile().fullListName.toLowerCase());
}

export function isDictionaryMirror(collection: {listType?: string | null; slug?: string | null; total: number}, dictionary: {kind: string; total: number; name?: string | null}): boolean {
  const profile = dictionarySourceProfile();
  const name = dictionary.name ?? "";
  const prefix = profile.fullListName;
  return collection.listType === "curated" && collection.slug === profile.fullListSlug && dictionary.kind === "dictionary" && dictionary.total === collection.total && name.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase() && !/\w/.test(name.slice(prefix.length, prefix.length + 1));
}

/** Preserve the configured legacy RPC field without baking its provider into code. */
export function dictionarySourceReference(row: Record<string, unknown>): Record<string, unknown> {
  const key = dictionarySourceProfile().sourceRankKey;
  return { [key]: row[key] };
}
