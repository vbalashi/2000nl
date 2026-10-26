import { describe, expect, test } from "vitest";
import {
  collectionsForLabel,
  parseLabelMutation,
  parseLabelsSnapshot,
} from "@/lib/collections/labels/model";
const ids = Array.from(
  { length: 6 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const label = (id: string, parent_id: string | null = null) => ({
  id,
  parent_id,
  name: "Урок",
  description: null,
  created_at: "2026-10-20T00:00:00Z",
  updated_at: "2026-10-20T00:00:00Z",
});
const snapshot = () => ({
  revision: 3,
  labels: [label(ids[0]), label(ids[1], ids[0]), label(ids[2])],
  assignments: [
    { label_id: ids[0], collection_id: ids[3] },
    { label_id: ids[1], collection_id: ids[3] },
    { label_id: ids[1], collection_id: ids[4] },
    { label_id: ids[2], collection_id: ids[5] },
  ],
});
describe("personal collection-label model", () => {
  test("parent projects descendant collections once and excludes other branches", () => {
    const parsed = parseLabelsSnapshot(snapshot());
    expect(parsed).not.toBeNull();
    expect(collectionsForLabel(parsed!, ids[0])).toEqual([ids[3], ids[4]]);
    expect(collectionsForLabel(parsed!, ids[2])).toEqual([ids[5]]);
    expect(collectionsForLabel(parsed!, ids[5])).toEqual([]);
  });
  test("rejects broken, cyclic or duplicate snapshot relationships", () => {
    const cyclic = snapshot();
    cyclic.labels[0].parent_id = ids[1];
    const missing = snapshot();
    missing.labels[0].parent_id = ids[5];
    const duplicate = snapshot();
    duplicate.assignments.push(duplicate.assignments[0]);
    for (const value of [
      cyclic,
      missing,
      duplicate,
      { ...snapshot(), revision: "3" },
      { ...snapshot(), labels: [...snapshot().labels, label(ids[0])] },
    ])
      expect(parseLabelsSnapshot(value)).toBeNull();
  });
  test("accepts empty catalog and a maximum-depth tree without manufacturing collections", () => {
    expect(
      parseLabelsSnapshot({ revision: 0, labels: [], assignments: [] }),
    ).toEqual({ revision: 0, labels: [], assignments: [] });
    const nodes = Array.from({ length: 17 }, (_, i) =>
      label(
        `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        i ? `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` : null,
      ),
    );
    expect(
      parseLabelsSnapshot({
        revision: 0,
        labels: nodes.slice(0, 16),
        assignments: [],
      }),
    ).not.toBeNull();
    expect(
      parseLabelsSnapshot({ revision: 0, labels: nodes, assignments: [] }),
    ).toBeNull();
  });
  test("explicit null moves to root and empty assignments clear labels", () => {
    for (const operation of [
      { type: "update", id: ids[0], parent_id: null },
      { type: "set-collection-labels", collection_id: ids[3], label_ids: [] },
      { type: "create", name: "Курс A2" },
    ])
      expect(parseLabelMutation({ expectedRevision: 0, operation })).toEqual({
        expectedRevision: 0,
        operation,
      });
  });
  test("rejects unexpected database payload fields rather than forwarding raw data", () => {
    expect(
      parseLabelsSnapshot({ ...snapshot(), privateDebug: "secret" }),
    ).toBeNull();
    const extra = snapshot();
    expect(
      parseLabelsSnapshot({
        ...extra,
        labels: [
          { ...extra.labels[0], owner_id: ids[5] },
          ...extra.labels.slice(1),
        ],
      }),
    ).toBeNull();
  });
  test("normalizes outer whitespace before database name validation", () => {
    expect(
      parseLabelMutation({
        expectedRevision: 0,
        operation: { type: "create", name: " \n Курс A2 \n " },
      })?.operation,
    ).toEqual({ type: "create", name: "Курс A2" });
  });
  test("closed envelopes reject user retargeting, unsafe revisions and malformed operations", () => {
    const operation = { type: "create", name: "Course" };
    const badOperations = [
      { ...operation, owner_id: ids[0] },
      { ...operation, name: " " },
      { type: "update", id: ids[0] },
      { type: "delete", id: "not-a-uuid" },
      {
        type: "set-collection-labels",
        collection_id: ids[3],
        label_ids: [ids[0], ids[0].toUpperCase()],
      },
      { type: "create", name: "x".repeat(101) },
    ];
    for (const bad of badOperations)
      expect(
        parseLabelMutation({ expectedRevision: 0, operation: bad }),
      ).toBeNull();
    for (const expectedRevision of [
      -1,
      0.5,
      "0",
      Number.MAX_SAFE_INTEGER,
      2147483647,
    ])
      expect(parseLabelMutation({ expectedRevision, operation })).toBeNull();
    expect(
      parseLabelMutation({ expectedRevision: 0, operation, userId: ids[0] }),
    ).toBeNull();
  });
});
