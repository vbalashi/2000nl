import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserSupabase } from "@/lib/platform/serverSupabase";
import type { DictionaryLookupPayload } from "@/lib/platform/lookupService";
import { coordinateDictionaryMeaningTranslation } from "@/lib/translation/dictionaryMeaningTranslationCoordinator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeLangForDb(lang: string) {
  return lang.trim().replace("_", "-").toLowerCase();
}

function json(payload: unknown, status: number, cacheStatus = "unknown") {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(cacheStatus === "unknown"
        ? {}
        : { "X-Translation-Cache": cacheStatus }),
    },
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wordEntryId = url.searchParams.get("word_id") ?? "";
  const lang = url.searchParams.get("lang") ?? "";
  const debug = url.searchParams.get("debug") === "1";
  const force = url.searchParams.get("force") === "1";

  if (!isUuid(wordEntryId)) return json({ error: "Invalid word_id" }, 400);
  if (!lang.trim()) return json({ error: "Missing lang" }, 400);

  const dbLang = normalizeLangForDb(lang);
  if (dbLang === "off") {
    return json({ error: "Translation is disabled." }, 400);
  }
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/.test(dbLang)) {
    return json({ error: "Invalid lang" }, 400);
  }

  const auth = await getAuthenticatedUserSupabase(req);
  if (auth instanceof NextResponse) return auth;

  const { data: word, error } = await auth.supabase.rpc(
    "fetch_dictionary_entry_by_id_gated",
    { p_entry_id: wordEntryId },
  );
  if (error) return json({ error: error.message }, 500);
  if (!word?.raw) return json({ error: "word_entry_not_found" }, 404);

  const result = await coordinateDictionaryMeaningTranslation({
    wordEntryId,
    word: word as DictionaryLookupPayload,
    targetLang: lang.trim(),
    dbLang,
    force,
    debug,
  });
  return json(result.payload, result.status, result.cacheStatus);
}
