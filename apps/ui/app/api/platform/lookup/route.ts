import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

type LookupRequestBody = {
  query?: unknown;
  includeUserState?: unknown;
};

type DictionaryLookupPayload = {
  id: string;
  dictionary_id?: string | null;
  language_code?: string | null;
  headword: string;
  meaning_id?: number | null;
  part_of_speech?: string | null;
  gender?: string | null;
  raw: unknown;
  is_nt2_2000?: boolean | null;
  meanings_count?: number | null;
};

async function readJson(request: NextRequest): Promise<LookupRequestBody | null> {
  try {
    return (await request.json()) as LookupRequestBody;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    return withPlatformCors(request, auth);
  }

  const body = await readJson(request);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const includeUserState = body?.includeUserState !== false;

  if (!query) {
    return reply({ error: "missing_query" }, 400);
  }

  const { data, error } = await auth.supabase.rpc("fetch_dictionary_entry_gated", {
    p_headword: query,
  });

  if (error) {
    return reply(
      { error: "lookup_failed", detail: error.message ?? String(error) },
      500,
    );
  }

  if (!data) {
    return reply({ query, items: [] });
  }

  const entry = data as DictionaryLookupPayload & {
    stats?: { click_count?: number | null; last_seen_at?: string | null };
  };

  let dictionary = null;
  if (entry.dictionary_id) {
    const { data: dictionaryData, error: dictionaryError } = await auth.supabase
      .from("dictionaries")
      .select(
        "id, language_code, slug, name, kind, visibility, schema_key, schema_version",
      )
      .eq("id", entry.dictionary_id)
      .maybeSingle();

    if (dictionaryError) {
      return reply(
        {
          error: "dictionary_metadata_failed",
          detail: dictionaryError.message ?? String(dictionaryError),
        },
        500,
      );
    }
    dictionary = dictionaryData ?? null;
  }

  let userStateByCardType = undefined;
  if (includeUserState) {
    const { data: statusRows, error: statusError } = await auth.supabase
      .from("user_word_status")
      .select(
        "mode, click_count, last_seen_at, last_reviewed_at, next_review_at, hidden, frozen_until, fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses, fsrs_last_grade, fsrs_last_interval",
      )
      .eq("user_id", auth.user.id)
      .eq("word_id", entry.id);

    if (statusError) {
      return reply(
        { error: "user_state_failed", detail: statusError.message ?? String(statusError) },
        500,
      );
    }

    userStateByCardType = Object.fromEntries(
      (statusRows ?? []).map((row: any) => [
        row.mode,
        {
          cardTypeId: row.mode,
          entryId: entry.id,
          clickCount: row.click_count ?? 0,
          lastSeenAt: row.last_seen_at ?? null,
          lastReviewedAt: row.last_reviewed_at ?? null,
          nextReviewAt: row.next_review_at ?? null,
          hidden: row.hidden ?? false,
          frozenUntil: row.frozen_until ?? null,
          fsrs: {
            stability: row.fsrs_stability ?? null,
            difficulty: row.fsrs_difficulty ?? null,
            reps: row.fsrs_reps ?? 0,
            lapses: row.fsrs_lapses ?? 0,
            lastGrade: row.fsrs_last_grade ?? null,
            lastInterval: row.fsrs_last_interval ?? null,
          },
        },
      ]),
    );
  }

  return reply({
    query,
    items: [
      {
        entry: {
          id: entry.id,
          dictionaryId: entry.dictionary_id ?? null,
          languageCode: entry.language_code ?? null,
          headword: entry.headword,
          meaningId: entry.meaning_id ?? null,
          partOfSpeech: entry.part_of_speech ?? null,
          gender: entry.gender ?? null,
          raw: entry.raw,
          isNt22000: entry.is_nt2_2000 ?? null,
          meaningsCount: entry.meanings_count ?? null,
        },
        dictionary: dictionary
          ? {
              id: dictionary.id,
              languageCode: dictionary.language_code,
              slug: dictionary.slug,
              name: dictionary.name,
              kind: dictionary.kind,
              visibility: dictionary.visibility,
              schemaKey: dictionary.schema_key,
              schemaVersion: dictionary.schema_version,
            }
          : null,
        ...(includeUserState ? { userStateByCardType } : {}),
        availableActions: [
          "record-view",
          "start-learning",
          "mark-unknown",
          "review-card",
          "add-to-list",
        ],
      },
    ],
  });
}
