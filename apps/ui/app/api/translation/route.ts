import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { TranslationOverlay, WordEntryTranslationStatus } from "@/lib/types";
import crypto from "crypto";

export const runtime = "nodejs";
// This route performs read-modify-write against Supabase and must never be cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TranslationRow = {
  word_entry_id: string;
  target_lang: string;
  provider: string;
  status: WordEntryTranslationStatus;
  overlay: TranslationOverlay | null;
  source_fingerprint: string | null;
  error_message: string | null;
  updated_at: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isFresh(updatedAt: string | null | undefined, freshForMs: number) {
  if (!updatedAt) return false;
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < freshForMs;
}

function normalizeLang(lang: string) {
  // DeepL expects upper-case language codes like RU, EN, EN-GB
  return lang.trim().replace("_", "-").toUpperCase();
}

function normalizeLangForDb(lang: string) {
  return lang.trim().replace("_", "-").toLowerCase();
}

type ExtractedItem = {
  path: Array<string | number>;
  text: string;
};

function extractTranslatableTexts(word: any): ExtractedItem[] {
  const raw = word?.raw;
  const meaning = raw?.meanings?.[0];
  if (!meaning || typeof meaning !== "object") return [];

  const out: ExtractedItem[] = [];
  const push = (path: Array<string | number>, text: unknown) => {
    if (typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    out.push({ path, text: trimmed });
  };

  // Include Dutch article (de/het) with the headword so the translation provider
  // has the correct noun sense / gender context.
  const headword: unknown = word?.headword;
  const genderRaw: unknown = word?.gender;
  const gender =
    typeof genderRaw === "string" ? genderRaw.trim().toLowerCase() : "";
  const article = gender === "de" || gender === "het" ? gender : "";
  const combined =
    article && typeof headword === "string" && headword.trim()
      ? `${article} ${headword.trim()}`
      : headword;
  push(["headword"], combined);
  push(["meanings", 0, "definition"], meaning.definition);
  push(["meanings", 0, "context"], meaning.context);

  if (Array.isArray(meaning.examples)) {
    meaning.examples.forEach((ex: unknown, i: number) => {
      push(["meanings", 0, "examples", i], ex);
    });
  }

  if (Array.isArray(meaning.idioms)) {
    meaning.idioms.forEach((idiom: any, i: number) => {
      if (typeof idiom === "string") {
        push(["meanings", 0, "idioms", i], idiom);
        return;
      }
      if (!idiom || typeof idiom !== "object") return;
      push(["meanings", 0, "idioms", i, "expression"], idiom.expression);
      push(["meanings", 0, "idioms", i, "explanation"], idiom.explanation);
    });
  }

  return out;
}

function buildOverlay(items: ExtractedItem[], translated: string[]): TranslationOverlay {
  const overlay: any = { meanings: [{}] };

  const setAtPath = (path: Array<string | number>, value: string) => {
    let cur: any = overlay;
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      const isLast = i === path.length - 1;

      if (isLast) {
        cur[key as any] = value;
        return;
      }

      const nextKey = path[i + 1];
      if (cur[key as any] == null) {
        cur[key as any] = typeof nextKey === "number" ? [] : {};
      }
      cur = cur[key as any];
    }
  };

  items.forEach((item, idx) => {
    setAtPath(item.path, translated[idx] ?? "");
  });

  return overlay;
}

function computeFingerprint(items: ExtractedItem[]) {
  // Stable hash of what we sent to DeepL (paths + texts)
  const payload = items.map((it) => ({ path: it.path, text: it.text }));
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(text: string) {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function buildContextXml(texts: string[]) {
  // One XML "document" so DeepL can use cross-field context.
  // Tags remain stable via tag_handling=xml; we parse translations by id.
  const body = texts
    .map((t, i) => `<t id="${i}">${escapeXml(t)}</t>`)
    .join("");
  return `<translations>${body}</translations>`;
}

function parseContextXml(xml: string, expectedCount: number) {
  const out: Array<string | undefined> = new Array(expectedCount).fill(undefined);
  const re = /<t\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const idx = Number(match[1]);
    if (!Number.isFinite(idx) || idx < 0 || idx >= expectedCount) continue;
    const raw = match[2] ?? "";
    out[idx] = unescapeXml(raw.trim());
  }

  const missing = out.findIndex((v) => typeof v !== "string");
  if (missing !== -1) {
    throw new Error(
      `DeepL returned incomplete XML translation (missing index ${missing})`
    );
  }

  return out as string[];
}

async function deeplTranslate(texts: string[], targetLang: string) {
  const authKey = process.env.DEEPL_API_KEY;
  if (!authKey) {
    throw new Error("DEEPL_API_KEY is not configured");
  }

  const url = process.env.DEEPL_API_URL ?? "https://api-free.deepl.com/v2/translate";

  const params = new URLSearchParams();
  params.set("target_lang", targetLang);
  // Send all whitelisted fields as ONE "document" to improve contextual translation.
  // This avoids translating each field in isolation (which often yields wrong sense
  // for the headword when an idiom/explanation is present).
  params.set("tag_handling", "xml");
  params.set("preserve_formatting", "1");
  params.append("text", buildContextXml(texts));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // DeepL docs (2025): authenticate via Authorization header
      // (auth_key in query/body is deprecated and will stop working)
      Authorization: `DeepL-Auth-Key ${authKey}`,
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepL error ${res.status}: ${body || res.statusText}`);
  }

  const data = (await res.json()) as { translations?: Array<{ text: string }> };
  const translatedXml = data.translations?.[0]?.text ?? "";
  if (!translatedXml.trim()) {
    throw new Error("DeepL returned an empty translation");
  }

  return parseContextXml(translatedXml, texts.length);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const wordEntryId = url.searchParams.get("word_id") ?? "";
  const lang = url.searchParams.get("lang") ?? "";
  const debug = url.searchParams.get("debug") === "1";
  const force = url.searchParams.get("force") === "1";

  if (!isUuid(wordEntryId)) {
    return NextResponse.json(
      { error: "Invalid word_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!lang.trim()) {
    return NextResponse.json(
      { error: "Missing lang" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const dbLang = normalizeLangForDb(lang);
  const targetLang = normalizeLang(lang);

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase is transitioning away from legacy JWT keys.
  // Prefer the new "secret key (default)" (store it as SUPABASE_SECRET_KEY),
  // but keep legacy env var name as fallback for existing setups.
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      {
        error: "Server is not configured",
        missing: {
          supabaseUrl: !supabaseUrl,
          serviceKey: !serviceKey,
        },
        ...(debug
          ? {
              debug: {
                hasSupabaseUrl: Boolean(supabaseUrl),
                hasServiceKey: Boolean(serviceKey),
              },
            }
          : null),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabaseProject = (() => {
    const m = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/);
    return m?.[1] ?? null;
  })();
  const serviceKeyPrefix = serviceKey.slice(0, 12);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js can cache fetch() calls in server contexts; ensure Supabase reads aren't cached
    // (otherwise we can get stuck seeing a stale "no rows" result forever).
    global: {
      fetch: (input, init) => fetch(input as any, { ...(init ?? {}), cache: "no-store" }),
    },
  });

  const lookup = () =>
    supabase
      .from("word_entry_translations")
      .select(
        "word_entry_id,target_lang,provider,status,overlay,source_fingerprint,error_message,updated_at"
      )
      .eq("word_entry_id", wordEntryId)
      .eq("target_lang", dbLang)
      .eq("provider", "deepl")
      .maybeSingle();

  const { data: existing, error: existingError } = await lookup();
  if (existingError) {
    return NextResponse.json(
      {
        error: existingError.message,
        ...(debug
          ? {
              debug: {
                dbLang,
                targetLang,
                supabaseProject,
                serviceKeyPrefix,
              },
            }
          : null),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const overlayHasHeadword =
    Boolean(existing?.overlay) && "headword" in ((existing?.overlay ?? {}) as any);
  // NOTE:
  // We intentionally delay the "ready" fast-path until after we compute the
  // current source_fingerprint, so cached overlays get refreshed when the
  // translation input changes (e.g. when including "de/het" with headword).

  // IMPORTANT:
  // This endpoint is the "worker" that produces translations. If we *only*
  // returned 'pending' here, a crashed/aborted request could leave rows stuck
  // in 'pending' forever (no background job will fix it).
  //
  // We still avoid duplicate in-flight work by treating very recent 'pending'
  // as fresh and returning it so the other request can finish.
  const pendingFreshForMs = 15_000;
  if (existing?.status === "pending" && isFresh(existing.updated_at, pendingFreshForMs)) {
    return NextResponse.json(
      {
        status: existing.status,
        ...(debug
          ? {
              debug: {
                branch: "fresh_pending",
                dbLang,
                targetLang,
                existingUpdatedAt: existing.updated_at,
                pendingFreshForMs,
                supabaseProject,
                serviceKeyPrefix,
              },
            }
          : null),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Fetch source word fields (also used to compute the fingerprint).
  const { data: word, error: wordError } = await supabase
    .from("word_entries")
    .select("headword,gender,raw")
    .eq("id", wordEntryId)
    .maybeSingle();

  if (wordError || !word?.raw) {
    const message = wordError?.message ?? "word_entries.raw not found";
    await supabase
      .from("word_entry_translations")
      .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
      .eq("word_entry_id", wordEntryId)
      .eq("target_lang", dbLang)
      .eq("provider", "deepl");

    return NextResponse.json(
      { status: "failed" as const, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const items = extractTranslatableTexts(word);
  const fingerprint = computeFingerprint(items);

  // Fast-path: return cached overlay only if it matches the current fingerprint.
  if (
    !force &&
    existing &&
    existing.status === "ready" &&
    existing.overlay &&
    overlayHasHeadword &&
    existing.source_fingerprint &&
    existing.source_fingerprint === fingerprint
  ) {
    return NextResponse.json(
      {
        status: existing.status,
        overlay: existing.overlay,
        ...(debug
          ? {
              debug: {
                branch: "fast_ready_fingerprint_match",
                dbLang,
                targetLang,
                existingUpdatedAt: existing.updated_at,
                supabaseProject,
                serviceKeyPrefix,
              },
            }
          : null),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Ensure row exists; if it doesn't, create pending row (race guard via unique constraint).
  if (!existing) {
    const { data: inserted, error: insertError } = await supabase
      .from("word_entry_translations")
      .upsert(
        {
          word_entry_id: wordEntryId,
          target_lang: dbLang,
          provider: "deepl",
          status: "pending",
          overlay: null,
          source_fingerprint: null,
          error_message: null,
        },
        { onConflict: "word_entry_id,target_lang,provider", ignoreDuplicates: true }
      )
      .select("word_entry_id")
      .maybeSingle();

    if (insertError) {
      return NextResponse.json(
        {
          error: insertError.message,
          ...(debug
            ? {
                debug: {
                  branch: "insert_error",
                  dbLang,
                  targetLang,
                  supabaseProject,
                  serviceKeyPrefix,
                },
              }
            : null),
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // If we lost the race, return current state (could already be ready).
    if (!inserted) {
      const { data: existingAfter, error: existingAfterError } = await lookup();
      if (existingAfterError) {
        return NextResponse.json(
          {
            error: existingAfterError.message,
            ...(debug
              ? {
                  debug: {
                    branch: "lookup_after_insert_error",
                    dbLang,
                    targetLang,
                    supabaseProject,
                    serviceKeyPrefix,
                  },
                }
              : null),
          },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }
      if (existingAfter) {
        return NextResponse.json(
          {
            status: existingAfter.status,
            overlay: existingAfter.overlay,
            error: existingAfter.error_message,
            ...(debug
              ? {
                  debug: {
                    branch: "lost_race_return_existing",
                    dbLang,
                    targetLang,
                    existingUpdatedAt: existingAfter.updated_at,
                    overlayHasHeadword:
                      Boolean(existingAfter.overlay) &&
                      "headword" in ((existingAfter.overlay ?? {}) as any),
                    supabaseProject,
                    serviceKeyPrefix,
                  },
                }
              : null),
          },
          { status: 200, headers: { "Cache-Control": "no-store" } }
        );
      }

      return NextResponse.json(
        {
          status: "pending" as const,
          ...(debug
            ? {
                debug: {
                  branch: "lost_race_no_row",
                  dbLang,
                  targetLang,
                  supabaseProject,
                  serviceKeyPrefix,
                },
              }
            : null),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // If a row exists but isn't ready (or is ready-but-missing-headword), mark it pending and re-run translation.
  // We do a conditional update to reduce stampedes: only the request that successfully
  // flips/refreshes updated_at should proceed; losers return current state.
  if (existing) {
    const needsWork =
      force ||
      existing.status !== "ready" ||
      (existing.status === "ready" && !overlayHasHeadword) ||
      !existing.source_fingerprint ||
      existing.source_fingerprint !== fingerprint;

    if (needsWork) {
      const nowIso = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabase
        .from("word_entry_translations")
        .update({
          status: "pending",
          error_message: null,
          updated_at: nowIso,
        })
        .eq("word_entry_id", wordEntryId)
        .eq("target_lang", dbLang)
        .eq("provider", "deepl")
        .eq("updated_at", (existing as TranslationRow).updated_at ?? null)
        .select("word_entry_id")
        .maybeSingle();

      if (claimError) {
        return NextResponse.json(
          { error: claimError.message },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }

      // If we failed to claim (someone else updated it), return current state.
      if (!claimed) {
        const { data: existingAfter, error: existingAfterError } = await lookup();
        if (existingAfterError) {
          return NextResponse.json(
            { error: existingAfterError.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
        return NextResponse.json(
          {
            status: existingAfter?.status ?? ("pending" as const),
            overlay: existingAfter?.overlay ?? null,
            error: existingAfter?.error_message ?? null,
          },
          { status: 200, headers: { "Cache-Control": "no-store" } }
        );
      }
    }
  }
  if (items.length === 0) {
    const overlay: TranslationOverlay = { headword: "", meanings: [{}] };
    await supabase
      .from("word_entry_translations")
      .update({
        status: "ready",
        overlay,
        source_fingerprint: fingerprint,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("word_entry_id", wordEntryId)
      .eq("target_lang", dbLang)
      .eq("provider", "deepl");

    return NextResponse.json(
      { status: "ready" as const, overlay },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const translatedTexts = await deeplTranslate(
      items.map((i) => i.text),
      targetLang
    );

    const overlay = buildOverlay(items, translatedTexts);

    const { error: updateError } = await supabase
      .from("word_entry_translations")
      .update({
        status: "ready",
        overlay,
        source_fingerprint: fingerprint,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("word_entry_id", wordEntryId)
      .eq("target_lang", dbLang)
      .eq("provider", "deepl");

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { status: "ready" as const, overlay },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "Unknown error").slice(0, 2000);

    await supabase
      .from("word_entry_translations")
      .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
      .eq("word_entry_id", wordEntryId)
      .eq("target_lang", dbLang)
      .eq("provider", "deepl");

    return NextResponse.json(
      { status: "failed" as const, error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
