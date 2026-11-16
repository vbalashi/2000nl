import { safeTextTranslation } from "@/lib/translation/safeTextTranslation";
import { readProviderJson, assertProviderInput, providerErrorResponse } from "@/lib/providers/providerSafety";
import { dictionaryEntrySourceStillReadable } from "@/lib/platform/dictionaryEntryReadAuthority";
import {parseCurrentTrainingCardRead} from "@/lib/platform/currentTrainingCardRequest";
import {requestCurrentTrainingCardTranslation} from "@/lib/translation/currentTrainingCardTranslation";
import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { asString } from "@/lib/platform/platformApi";
import type { DictionaryLookupPayload } from "@/lib/platform/lookupService";
import { requestDictionaryMeaningTranslation } from "@/lib/translation/dictionaryMeaningTranslationRequestService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TranslationRequestBody = {
  currentCard?: unknown;
  entryId?: unknown;
  item?: unknown;
  targetLang?: unknown;
  force?: unknown;
  debug?: unknown;
  observeOnly?: unknown;
  background?: unknown;
};

async function readJson(request: NextRequest): Promise<TranslationRequestBody | null> {
  try {
    return (await readProviderJson(request, "translation")) as TranslationRequestBody;
  } catch {
    return null;
  }
}

function boolParam(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function normalizeTargetLanguage(value: string) {
  const targetLang = value.trim();
  const dbLang = targetLang.replace("_", "-").toLowerCase();
  if (dbLang === "off") return { error: "translation_disabled" as const };
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/.test(dbLang)) {
    return { error: "Invalid lang" as const };
  }
  return { targetLang, dbLang };
}

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const startedAt = performance.now();
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const body = await readJson(request);
  const entryId = asString(body?.entryId);
  const item = asRecord(body?.item);
  const explicitTargetLang = asString(body?.targetLang);

  if (!entryId && !item) {
    return reply({ error: "missing_entry_id" }, 400);
  }
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    const payload =
      !explicitTargetLang && auth.status === 401
        ? { error: "authentication_required" }
        : await auth.json().catch(() => null);
    return reply(
      {
        entryId,
        targetLang: explicitTargetLang,
        ...(payload && typeof payload === "object" ? payload : { error: "translation_failed" }),
      },
      auth.status,
    );
  }
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) {
    const payload = await scopeError.json().catch(() => null);
    return reply(
      {
        entryId,
        targetLang: explicitTargetLang,
        ...(payload && typeof payload === "object" ? payload : { error: "translation_failed" }),
      },
      scopeError.status,
    );
  }

  let requestedTargetLang = explicitTargetLang;
  if (!requestedTargetLang) {
    const { data, error } = await auth.supabase
      .from("user_settings")
      .select("translation_lang")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) {
      return reply(
        { entryId, targetLang: null, error: "translation_preference_failed", detail: error.message },
        500,
      );
    }
    requestedTargetLang = data?.translation_lang ?? "en";
  }

  const language = normalizeTargetLanguage(requestedTargetLang ?? "en");
  if ("error" in language) {
    return reply(
      { entryId, targetLang: requestedTargetLang, error: language.error },
      400,
    );
  }
  const { targetLang, dbLang } = language;

  if (item) {
    const draftTranslation = await translateDraftItem(item, targetLang, auth.user.id);
    return reply(draftTranslation.payload, draftTranslation.status);
  }
  if (!entryId) {
    return reply({ error: "missing_entry_id" }, 400);
  }

  const currentCard=body?.currentCard===undefined?undefined:parseCurrentTrainingCardRead(body.currentCard);
  if(currentCard===null)return reply({error:"invalid_current_training_card_request"},400);
  if(currentCard && (auth.principal.authKind!=="first_party" || process.env.NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED!=="true"))
    return reply({error:"current_training_card_forbidden"},403);
  const readCurrent=()=>auth.supabase.rpc("read_current_training_entry_v1",{
    p_user_id:auth.user.id,p_session_id:currentCard!.sessionId,p_permit_id:currentCard!.permitId,
  });
  let entry:DictionaryLookupPayload & {archived_at?:string|null};
  if(currentCard){
    const {data,error}=await readCurrent();
    const item=Array.isArray(data?.items)?data.items.find((value:{id?:string})=>value.id===entryId):null;
    if(error||!item)return reply({error:"current_training_permit_invalid"},403);
    entry=item;
  }else{
    const {data,error}=await auth.supabase.rpc("fetch_dictionary_entry_by_id_gated",{p_entry_id:entryId});
    if(error)return reply({entryId,targetLang,error:error.message},500);
    entry=data;
  }
  if(!entry?.raw)return reply({entryId,targetLang,error:"word_entry_not_found"},404);
  const translationInput={
    wordEntryId:entryId,word:entry,targetLang,dbLang,
    force:boolParam(body?.force),debug:boolParam(body?.debug),observeOnly:boolParam(body?.observeOnly),priority:body?.background===true?0:10,
  };
  const currentStillAuthorized = async () => {
    const {data,error}=await readCurrent();
    return !error && Array.isArray(data?.items) && data.items.some((value:{id?:string})=>value.id===entryId);
  };
  const result=currentCard && entry.archived_at
    ? await requestCurrentTrainingCardTranslation(translationInput,currentStillAuthorized)
    : await requestDictionaryMeaningTranslation(translationInput);
  // A request can start before archive and outlive a takeover or permit expiry.
  // Recheck every explicit current-card response, including the ordinary path.
  if (currentCard && !await currentStillAuthorized()) {
    return reply({error:"current_training_permit_invalid"},403);
  }
  if (!currentCard && !await dictionaryEntrySourceStillReadable(auth, entry)) {
    return reply({error:"word_entry_not_found"},404);
  }
  const response = reply({ entryId, targetLang, ...result.payload }, result.httpStatus);
  response.headers.set("X-Platform-Cache", result.cacheStatus);
  response.headers.set(
    "Server-Timing",
    `route.total;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`,
  );
  return response;
}

async function translateDraftItem(
  item: Record<string, unknown>,
  targetLang: string,
  accountId: string,
): Promise<{ payload: unknown; status: number }> {
  const entry = asRecord(item.entry) ?? {};
  const content = asRecord(entry.content) ?? {};
  const headword = asString(content.headword) ?? asString(entry.headword);
  const sections = asArray(content.sections)
    .map((section) => asRecord(section))
    .filter((section): section is Record<string, unknown> =>
      Boolean(section && asString(section.text)),
    );
  const texts = [
    ...(headword ? [{ kind: "headword", text: headword }] : []),
    ...sections.map((section) => ({
      kind: asString(section.kind) ?? "meaning",
      text: asString(section.text) ?? "",
    })),
  ];

  if (!texts.length) {
    return { payload: { error: "missing_translatable_content" }, status: 400 };
  }

  let translations: string[];
  try {
    assertProviderInput("translation", texts.map(item => item.text));
    const work = await safeTextTranslation(accountId, "draft", {
      texts: texts.map(item => item.text), targetLanguageCode: targetLang, purpose: "manual-dictionary-card",
    });
    if (work.status === "pending") return { payload: { status: "pending", targetLang, retryAfterMs: work.retryAfterMs }, status: 200 };
    translations = work.result.translations;
  } catch (error) {
    const failure = providerErrorResponse(error);
    return { payload: { targetLang, status: "failed", error: { code: failure.status === 502 ? "translation_failed" : failure.payload.error, message: failure.payload.error }, ...(failure.payload.retryAfterMs ? { retryAfterMs: failure.payload.retryAfterMs } : {}) }, status: failure.status };
  }

  const translated = texts.map((item, index) => ({
    ...item,
    translatedText: translations[index] ?? "",
  }));
  const headwordTranslation =
    translated.find((item) => item.kind === "headword")?.translatedText ?? "";
  const meaningTranslations = translated
    .filter((item) => item.kind === "meaning")
    .map((item) => item.translatedText)
    .filter(Boolean);
  const exampleTranslations = translated
    .filter((item) => item.kind === "example")
    .map((item) => item.translatedText)
    .filter(Boolean);
  const noteTranslation =
    translated.find((item) => item.kind === "note")?.translatedText ?? "";

  return {
    payload: {
      entryId: asString(entry.id) ?? null,
      targetLang,
      status: "ready",
      overlay: {
        ...(headwordTranslation ? { headword: headwordTranslation } : {}),
        meanings: [
          {
            ...(meaningTranslations[0] ? { definition: meaningTranslations[0] } : {}),
            ...(noteTranslation ? { context: noteTranslation } : {}),
            ...(exampleTranslations.length ? { examples: exampleTranslations } : {}),
          },
        ],
        __meta: {
          translationPolicyVersion: "platform-generated-draft-translation-v1",
        },
      },
      translationPolicyVersion: "platform-generated-draft-translation-v1",
    },
    status: 200,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
