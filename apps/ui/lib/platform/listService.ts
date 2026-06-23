type InternalListMembershipRow = {
  entry_id?: string | null;
  lists?: Array<{
    id?: string | null;
    kind?: string | null;
    name?: string | null;
    description?: string | null;
    primary_language_code?: string | null;
    default_scenario_id?: string | null;
    card_policy?: string | null;
    card_type_ids?: string[] | null;
    item_count?: number | null;
  }>;
};

export type EntryListMembership = {
  entryId: string;
  lists: Array<{
    id: string | null;
    kind: string;
    name: string;
    description: string | null;
    primaryLanguageCode: string | null;
    defaultScenarioId: string | null;
    cardPolicy: string;
    cardTypeIds: string[] | null;
    itemCount: number;
  }>;
};

export function mapUserListRpcPayload(row: any) {
  if (!row || typeof row !== "object") return null;
  const count = Array.isArray(row.user_word_list_items)
    ? row.user_word_list_items[0]?.count
    : undefined;

  return {
    id: row.id,
    kind: "user",
    name: row.name,
    description: row.description ?? null,
    primaryLanguageCode: row.primary_language_code ?? row.language_code ?? null,
    defaultScenarioId: row.default_scenario_id ?? null,
    cardPolicy: row.card_policy ?? "inherit",
    cardTypeIds: row.card_type_ids ?? null,
    itemCount: typeof count === "number" ? count : 0,
  };
}

export function mapListMembershipRpcRows(rows: unknown): EntryListMembership[] {
  if (!Array.isArray(rows)) return [];

  return (rows as InternalListMembershipRow[])
    .filter((row) => Boolean(row?.entry_id) && Array.isArray(row.lists))
    .map((row) => ({
      entryId: row.entry_id as string,
      lists: (row.lists ?? []).map((list) => ({
        id: list.id ?? null,
        kind: list.kind ?? "user",
        name: list.name ?? "",
        description: list.description ?? null,
        primaryLanguageCode: list.primary_language_code ?? null,
        defaultScenarioId: list.default_scenario_id ?? null,
        cardPolicy: list.card_policy ?? "inherit",
        cardTypeIds: list.card_type_ids ?? null,
        itemCount: list.item_count ?? 0,
      })),
    }));
}
