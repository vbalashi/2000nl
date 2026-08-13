import type { ServiceSupabase } from "./serverSupabase";
import type { DictionaryLookupPayload } from "./lookupService";

export type ResolvedPlatformV2CrossReferenceTarget = {
  query: string;
  headwordGroupId?: string;
  entryId?: string;
};

type CrossReferenceSource = {
  sourceEntryId: string;
  sourceDictionaryId: string;
  query: string;
};

const CROSS_REFERENCE_ENRICHMENT_BUDGET = 8;

export async function resolvePlatformV2CrossReferenceTargets(
  service: ServiceSupabase,
  input: {
    sources: CrossReferenceSource[];
    userId: string | null;
    catalog: boolean;
    contentLanguageCode: string | null;
  },
): Promise<Map<string, ResolvedPlatformV2CrossReferenceTarget>> {
  const targets = new Map(
    input.sources.map((source) => [
      source.sourceEntryId,
      { query: source.query } as ResolvedPlatformV2CrossReferenceTarget,
    ]),
  );
  const sourcesByLookup = new Map<string, CrossReferenceSource[]>();
  for (const source of input.sources) {
    const key = `${source.sourceDictionaryId}\u0000${normalize(source.query)}`;
    const sources = sourcesByLookup.get(key) ?? [];
    sources.push(source);
    sourcesByLookup.set(key, sources);
  }

  const exactCandidatesByLookup = new Map<string, DictionaryLookupPayload[]>();
  const budgetedLookups = Array.from(sourcesByLookup).slice(
    0,
    CROSS_REFERENCE_ENRICHMENT_BUDGET,
  );
  await Promise.all(
    budgetedLookups.map(async ([key, sources]) => {
      const source = sources[0];
      const result = await service.supabase.rpc("lookup_platform_v2_entries", {
        p_user_id: input.userId,
        p_catalog: input.catalog,
        p_query: source.query,
        p_language_code: input.contentLanguageCode,
        p_cursor: null,
        p_group_limit: 10,
        p_group_entry_bound: 50,
      });
      if (result.error) return;
      const page = asRecord(asRecord(result.data).page);
      if (page.selectedTierComplete !== true) return;
      const candidates = lookupEntries(result.data).filter(
        (candidate) =>
          candidate.dictionary_id === source.sourceDictionaryId &&
          normalize(candidate.headword) === normalize(source.query),
      );
      if (candidates.length) exactCandidatesByLookup.set(key, candidates);
    }),
  );

  const candidateIds = Array.from(
    new Set(
      Array.from(exactCandidatesByLookup.values()).flatMap((candidates) =>
        candidates.map((candidate) => candidate.id),
      ),
    ),
  );
  if (!candidateIds.length) return targets;

  const identityResult = await service.supabase.rpc(
    "read_platform_v2_presentation_identity",
    {
      p_user_id: input.userId,
      p_entry_ids: candidateIds,
      p_catalog: input.catalog,
    },
  );
  if (identityResult.error) return targets;
  const groupByEntryId = presentationGroups(identityResult.data);

  for (const [key, sources] of sourcesByLookup) {
    const candidates = exactCandidatesByLookup.get(key) ?? [];
    const groupIds = new Set(
      candidates
        .map((candidate) => groupByEntryId.get(candidate.id))
        .filter((groupId): groupId is string => Boolean(groupId)),
    );
    if (groupIds.size !== 1) continue;
    const headwordGroupId = Array.from(groupIds)[0];
    const entryId = candidates.length === 1 ? candidates[0].id : undefined;
    for (const source of sources) {
      targets.set(source.sourceEntryId, {
        query: source.query,
        headwordGroupId,
        ...(entryId ? { entryId } : {}),
      });
    }
  }
  return targets;
}

function lookupEntries(value: unknown): DictionaryLookupPayload[] {
  const payload = asRecord(value);
  const items = payload.items ?? value;
  if (Array.isArray(items)) return items as DictionaryLookupPayload[];
  return items ? [items as DictionaryLookupPayload] : [];
}

function presentationGroups(value: unknown): Map<string, string> {
  const entries = asRecord(value).entries;
  if (!Array.isArray(entries)) return new Map();
  return new Map(
    entries.flatMap((value) => {
      const entry = asRecord(value);
      return typeof entry.entryId === "string" &&
        typeof entry.headwordGroupId === "string"
        ? [[entry.entryId, entry.headwordGroupId] as const]
        : [];
    }),
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}
