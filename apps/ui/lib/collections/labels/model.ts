/** Personal organization only: labels never create dictionary or sharing access. */
export const MAX_LABEL_REQUEST_BYTES = 64 * 1024;
export const MAX_LABELS = 1000;
export const MAX_LABEL_ASSIGNMENTS = 10000;
const MAX_REVISION = 2147483646;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);
const revision = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MAX_REVISION;
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  Array.from(value.trim()).length > 0 &&
  Array.from(value.trim()).length <= max;
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const owns = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

export type CollectionLabel = {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};
export type CollectionLabelsSnapshot = {
  revision: number;
  labels: CollectionLabel[];
  assignments: Array<{ collection_id: string; label_id: string }>;
};
export type CollectionLabelOperation =
  | {
      type: "create";
      id?: string;
      name: string;
      description?: string | null;
      parent_id?: string | null;
    }
  | {
      type: "update";
      id: string;
      name?: string;
      description?: string | null;
      parent_id?: string | null;
    }
  | { type: "delete"; id: string }
  | {
      type: "set-collection-labels";
      collection_id: string;
      label_ids: string[];
    };

export function parseLabelMutation(value: unknown): {
  expectedRevision: number;
  operation: CollectionLabelOperation;
} | null {
  if (
    !record(value) ||
    !keys(value, ["expectedRevision", "operation"]) ||
    !revision(value.expectedRevision) ||
    !record(value.operation)
  )
    return null;
  const operation = value.operation;
  if (operation.type === "set-collection-labels") {
    if (
      !keys(operation, ["type", "collection_id", "label_ids"]) ||
      !id(operation.collection_id) ||
      !Array.isArray(operation.label_ids) ||
      operation.label_ids.length > MAX_LABELS ||
      !operation.label_ids.every(id) ||
      new Set(operation.label_ids.map((item) => item.toLowerCase())).size !==
        operation.label_ids.length
    )
      return null;
  } else if (operation.type === "delete") {
    if (!keys(operation, ["type", "id"]) || !id(operation.id)) return null;
  } else if (operation.type === "create" || operation.type === "update") {
    if (!keys(operation, ["type", "id", "name", "description", "parent_id"]))
      return null;
    if (
      operation.type === "update"
        ? !id(operation.id)
        : owns(operation, "id") && !id(operation.id)
    )
      return null;
    if (
      operation.type === "create"
        ? !text(operation.name, 100)
        : owns(operation, "name") && !text(operation.name, 100)
    )
      return null;
    if (
      owns(operation, "parent_id") &&
      operation.parent_id !== null &&
      !id(operation.parent_id)
    )
      return null;
    if (
      owns(operation, "description") &&
      operation.description !== null &&
      (typeof operation.description !== "string" ||
        Array.from(operation.description).length > 1000)
    )
      return null;
    if (
      operation.type === "update" &&
      !["name", "description", "parent_id"].some((field) =>
        owns(operation, field),
      )
    )
      return null;
  } else return null;
  return {
    expectedRevision: value.expectedRevision,
    operation: {
      ...operation,
      ...(typeof operation.name === "string"
        ? { name: operation.name.trim() }
        : {}),
    } as CollectionLabelOperation,
  };
}

export function parseLabelsSnapshot(
  value: unknown,
): CollectionLabelsSnapshot | null {
  if (
    !record(value) ||
    !keys(value, ["revision", "labels", "assignments"]) ||
    !revision(value.revision) ||
    !Array.isArray(value.labels) ||
    value.labels.length > MAX_LABELS ||
    !Array.isArray(value.assignments) ||
    value.assignments.length > MAX_LABEL_ASSIGNMENTS
  )
    return null;
  const labelIds = new Set<string>();
  for (const label of value.labels) {
    if (
      !record(label) ||
      !keys(label, [
        "id",
        "parent_id",
        "name",
        "description",
        "created_at",
        "updated_at",
      ]) ||
      !id(label.id) ||
      labelIds.has(label.id) ||
      (label.parent_id !== null && !id(label.parent_id)) ||
      !text(label.name, 100) ||
      (label.description !== null &&
        (typeof label.description !== "string" ||
          Array.from(label.description).length > 1000)) ||
      typeof label.created_at !== "string" ||
      typeof label.updated_at !== "string"
    )
      return null;
    labelIds.add(label.id);
  }
  const parents = new Map(
    value.labels.map((label) => [label.id, label.parent_id]),
  );
  for (const label of value.labels) {
    const seen = new Set<string>();
    let current: string | null = label.id;
    while (current !== null) {
      if (!labelIds.has(current) || seen.has(current) || seen.size >= 16)
        return null;
      seen.add(current);
      current = parents.get(current) ?? null;
    }
  }
  const assignments = new Set<string>();
  for (const item of value.assignments) {
    if (
      !record(item) ||
      !keys(item, ["collection_id", "label_id"]) ||
      !id(item.collection_id) ||
      !id(item.label_id) ||
      !labelIds.has(item.label_id)
    )
      return null;
    const key = `${item.collection_id}:${item.label_id}`;
    if (assignments.has(key)) return null;
    assignments.add(key);
  }
  return value as CollectionLabelsSnapshot;
}

/** Label projection only; consumers still obtain collection content through its gated read. */
export function collectionsForLabel(
  snapshot: CollectionLabelsSnapshot,
  labelId: string,
): string[] {
  if (!snapshot.labels.some((label) => label.id === labelId)) return [];
  const included = new Set([labelId]);
  for (let level = 0; level < 16; level++) {
    let changed = false;
    for (const label of snapshot.labels) {
      if (
        label.parent_id &&
        included.has(label.parent_id) &&
        !included.has(label.id)
      ) {
        included.add(label.id);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return Array.from(
    new Set(
      snapshot.assignments
        .filter((item) => included.has(item.label_id))
        .map((item) => item.collection_id),
    ),
  ).sort();
}
