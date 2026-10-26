/** Selection preferences, never dictionary ACLs or current-session membership. */
export type MaterialPreferences = {
  schemaVersion: 1;
  /** Empty retains the legacy implicit catalog; an explicit list is ordered. */
  learningLanguages: { code: string; paused: boolean }[];
  disabledDictionaryIds: string[];
};
export type MaterialPreferencesSnapshot = {
  revision: number;
  document: MaterialPreferences;
};
export const MAX_MATERIAL_PREFERENCES_BYTES = 65536;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const unique = (values: string[]) => new Set(values).size === values.length;
export function parseMaterialPreferences(
  value: unknown,
): MaterialPreferences | null {
  if (
    !object(value) ||
    !exact(value, [
      "schemaVersion",
      "learningLanguages",
      "disabledDictionaryIds",
    ]) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.learningLanguages) ||
    !Array.isArray(value.disabledDictionaryIds)
  )
    return null;
  if (
    value.learningLanguages.length > 100 ||
    value.disabledDictionaryIds.length > 1000 ||
    new TextEncoder().encode(JSON.stringify(value)).length >
      MAX_MATERIAL_PREFERENCES_BYTES
  )
    return null;
  const languages: MaterialPreferences["learningLanguages"] = [];
  for (const item of value.learningLanguages) {
    if (
      !object(item) ||
      !exact(item, ["code", "paused"]) ||
      typeof item.code !== "string" ||
      item.code.length > 35 ||
      !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(item.code) ||
      typeof item.paused !== "boolean"
    )
      return null;
    languages.push({ code: item.code, paused: item.paused });
  }
  if (
    !unique(languages.map((item) => item.code)) ||
    (languages.length > 0 && languages.every((item) => item.paused))
  )
    return null;
  const ids: string[] = [];
  for (const id of value.disabledDictionaryIds) {
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    )
      return null;
    ids.push(id);
  }
  if (!unique(ids)) return null;
  return {
    schemaVersion: 1,
    learningLanguages: languages,
    disabledDictionaryIds: ids,
  };
}
export function parseMaterialPreferencesSnapshot(
  value: unknown,
): MaterialPreferencesSnapshot | null {
  if (
    !object(value) ||
    !Number.isInteger(value.revision) ||
    typeof value.revision !== "number" ||
    value.revision < 0 ||
    value.revision > 2147483647
  )
    return null;
  const document = parseMaterialPreferences(value.document);
  return document ? { revision: value.revision, document } : null;
}
export const emptyMaterialPreferences = (): MaterialPreferencesSnapshot => ({
  revision: 0,
  document: {
    schemaVersion: 1,
    learningLanguages: [],
    disabledDictionaryIds: [],
  },
});
