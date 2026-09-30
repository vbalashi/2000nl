/** First-party Library query scope; exact group reads never carry this selection. */
export type LibrarySearchScope = { dictionaryIds: string[] | null };
export function parseLibrarySearchScope(
  value: unknown,
): LibrarySearchScope | null {
  if (value === undefined || value === null) return { dictionaryIds: null };
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (id) =>
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  )
    return null;
  return {
    dictionaryIds: [...new Set(value.map((id) => id.toLowerCase()))].sort(),
  };
}
