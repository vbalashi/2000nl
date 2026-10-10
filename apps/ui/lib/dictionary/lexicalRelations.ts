/** Canonical source order shared by translation inputs, cache and relation display. */
export function dictionaryLexicalRelationTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item =>
    typeof item === "string" && item.trim() ? [item.trim()] : [],
  ))];
}
