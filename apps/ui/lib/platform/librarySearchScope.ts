/** First-party Library query scope; exact group reads never carry this selection. */
export const LIBRARY_PARTS = [
  "noun", "verb", "adjective", "adverb", "pronoun", "preposition",
  "conjunction", "numeral", "article", "interjection",
] as const;
export type LibraryPart = (typeof LIBRARY_PARTS)[number];
export type LibraryEntryFilters = {
  parts: LibraryPart[];
  article: "de" | "het" | null;
};
export const EMPTY_LIBRARY_ENTRY_FILTERS: LibraryEntryFilters = { parts: [], article: null };
export type LibrarySearchScope = {
  dictionaryIds: string[] | null;
  filters?: LibraryEntryFilters;
};
export type LibrarySearchSummary = {
  totalGroups: number;
  matchingEntryIds: string[];
};
/** Missing filters retain the migration-185 boundary; null/malformed filters fail closed. */
export function parseLibraryEntryFilters(value: unknown): LibraryEntryFilters | undefined | null {
  if (value === undefined)
    return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== "parts" && key !== "article"))
    return null;
  const parts = record.parts === undefined ? [] : record.parts;
  const article = record.article === undefined ? null : record.article;
  if (!Array.isArray(parts) || parts.length > LIBRARY_PARTS.length ||
    parts.some(part => typeof part !== "string" || !LIBRARY_PARTS.includes(part as LibraryPart)) ||
    (article !== null && article !== "de" && article !== "het") ||
    (article !== null && !parts.includes("noun")))
    return null;
  return { parts: [...new Set(parts as LibraryPart[])].sort(), article };
}
export function parseLibrarySearchScope(value: unknown): LibrarySearchScope | null {
  if (value === undefined || value === null)
    return { dictionaryIds: null };
  if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))
    return null;
  return { dictionaryIds: [...new Set(value.map(id => id.toLowerCase()))].sort() };
}
const partAliases: Record<string, LibraryPart> = {
  zn: "noun", ww: "verb", bn: "adjective", bw: "adverb", vnw: "pronoun",
  vz: "preposition", vw: "conjunction", tw: "numeral", lidw: "article", tsw: "interjection",
};
/** Mirrors the DB predicate only to choose a preview sense; never filters paginated groups. */
export function libraryEntryMatchesFilters(partValue: string | null | undefined, gender: string | null | undefined, filters: LibraryEntryFilters): boolean {
  const source = (partValue ?? "").trim().toLowerCase();
  const part = partAliases[source] ?? source;
  return (!filters.parts.length || filters.parts.includes(part as LibraryPart)) &&
    (!filters.article || part !== "noun" ||
      (gender ?? "").trim().toLowerCase().split(/\s*[/,]\s*/).includes(filters.article));
}
