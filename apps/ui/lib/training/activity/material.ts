export type MaterialProgress = {
  kind: "all" | "dictionary" | "collection";
  id: string | null;
  listType: "curated" | "user" | null;
  name: string | null;
  personal: boolean;
  total: number;
  started: number;
  due: number;
};
export type MaterialProgressPage = { languageCode: string; materials: MaterialProgress[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export const materialKey = (m: Pick<MaterialProgress, "kind" | "id" | "listType">) => m.kind === "all" ? "all" : `${m.kind}:${m.listType ?? ""}:${m.id}`;

/** Server material rows; All comes first and named rows carry canonical identities. */
export function parseMaterialProgress(value: unknown, languageCode: string): MaterialProgressPage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.languageCode !== languageCode || !Array.isArray(v.materials) || v.materials.length === 0 || v.materials.length > 201) return null;
  const materials: MaterialProgress[] = [];
  for (const [index, raw] of v.materials.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const m = raw as Record<string, unknown>;
    if (!count(m.total) || !count(m.started) || !count(m.due) || m.started > m.total) return null;
    if (index === 0) {
      if (m.kind !== "all") return null;
      materials.push({ kind: "all", id: null, listType: null, name: null, personal: false, total: m.total, started: m.started, due: m.due });
      continue;
    }
    if ((m.kind !== "dictionary" && m.kind !== "collection") || typeof m.id !== "string" || !UUID.test(m.id)
      || typeof m.name !== "string" || !m.name || typeof m.personal !== "boolean") return null;
    const listType = m.kind === "collection" ? m.listType : null;
    if (m.kind === "collection" && listType !== "curated" && listType !== "user") return null;
    materials.push({ kind: m.kind, id: m.id, listType: listType as MaterialProgress["listType"], name: m.name, personal: m.personal, total: m.total, started: m.started, due: m.due });
  }
  return { languageCode, materials };
}
