export const copyUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export type EntryCopyPreview = {
  sourceEntryId: string;
  revision: string;
  headword: string;
  languageCode: string;
  sourceDictionaryName: string;
  meaningCount: number;
};
export type EntryCopyCommand = {
  operationId: string;
  sourceEntryId: string;
  expectedRevision: string;
};
export type EntryCopyReceipt =
  | { operationId: string; status: "unknown" }
  | {
      operationId: string;
      status: "completed";
      entryId: string;
      dictionaryId: string;
      headword: string;
      languageCode: string;
    };
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function parseEntryCopyCommand(value: unknown): EntryCopyCommand | null {
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !==
      "expectedRevision,operationId,sourceEntryId" ||
    !copyUuid(value.operationId) ||
    !copyUuid(value.sourceEntryId) ||
    typeof value.expectedRevision !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.expectedRevision)
  )
    return null;
  return {
    operationId: value.operationId,
    sourceEntryId: value.sourceEntryId,
    expectedRevision: value.expectedRevision,
  };
}
export function parseEntryCopyPreview(
  value: unknown,
  entryId: string,
): EntryCopyPreview | null {
  if (
    !record(value) ||
    value.sourceEntryId !== entryId ||
    typeof value.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.revision) ||
    typeof value.headword !== "string" ||
    !value.headword.trim() ||
    value.headword.length > 1000 ||
    typeof value.languageCode !== "string" ||
    !value.languageCode ||
    value.languageCode.length > 32 ||
    typeof value.sourceDictionaryName !== "string" ||
    !value.sourceDictionaryName.trim() ||
    value.sourceDictionaryName.length > 1000 ||
    !Number.isSafeInteger(value.meaningCount) ||
    Number(value.meaningCount) < 1 ||
    Number(value.meaningCount) > 100
  )
    return null;
  return {
    sourceEntryId: entryId,
    revision: value.revision,
    headword: value.headword,
    languageCode: value.languageCode,
    sourceDictionaryName: value.sourceDictionaryName,
    meaningCount: Number(value.meaningCount),
  };
}
export function parseEntryCopyReceipt(
  value: unknown,
  operationId: string,
): EntryCopyReceipt | null {
  if (!record(value) || value.operationId !== operationId) return null;
  if (value.status === "unknown") return { operationId, status: "unknown" };
  if (
    value.status === "completed" &&
    copyUuid(value.entryId) &&
    copyUuid(value.dictionaryId) &&
    typeof value.headword === "string" &&
    !!value.headword.trim() &&
    value.headword.length <= 1000 &&
    typeof value.languageCode === "string" &&
    !!value.languageCode &&
    value.languageCode.length <= 32
  )
    return {
      operationId,
      status: "completed",
      entryId: value.entryId,
      dictionaryId: value.dictionaryId,
      headword: value.headword,
      languageCode: value.languageCode,
    };
  return null;
}
