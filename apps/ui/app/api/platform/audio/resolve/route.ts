import { recordProviderEvent } from "@/lib/providers/providerDiagnostics";
import { readProviderJson, assertProviderInput, providerErrorResponse } from "@/lib/providers/providerSafety";
import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { asString } from "@/lib/platform/platformApi";
import {
  resolveTtsAudio,
} from "@/lib/audio/ttsCache";
import { publicAudioAssetUrl } from "@/lib/platform/audioAssetUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AudioResolveBody = {
  text?: unknown;
  languageCode?: unknown;
  purpose?: unknown;
  quality?: unknown;
};

const ALLOWED_PURPOSES = new Set([
  "dictionary-headword",
  "manual-dictionary-card",
  "youtube-phrase-practice",
  "pontix-phrase",
]);

async function readJson(request: NextRequest): Promise<AudioResolveBody | null> {
  try {
    return (await readProviderJson(request, "audio")) as AudioResolveBody;
  } catch {
    return null;
  }
}

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const startedAt = performance.now();
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    return withPlatformCors(request, auth);
  }
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) return withPlatformCors(request, scopeError);

  const body = await readJson(request);
  const text = asString(body?.text);
  const languageCode = asString(body?.languageCode) ?? "nl";
  const purpose = asString(body?.purpose) ?? "dictionary-headword";

  if (!text) return reply({ error: "missing_text" }, 400);
  try { assertProviderInput("audio", [text]); } catch (error) { const failure = providerErrorResponse(error); return reply(failure.payload, failure.status); }
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(languageCode)) {
    return reply({ error: "unsupported_language" }, 400);
  }
  if (!ALLOWED_PURPOSES.has(purpose)) {
    return reply({ error: "unsupported_audio_purpose" }, 400);
  }

  try {
    const artifact = await resolveTtsAudio({
      text,
      quality: body?.quality,
      accountId: auth.user.id,
    });
    recordProviderEvent({ kind: "audio_resolution", source: artifact.cached ? "cache" : "generated", purpose: "resolve" });
    const response = reply({
      status: "ready",
      asset: {
        assetId: `tts_${artifact.cacheKey}`,
        kind: "generated",
        source: "2000nl-tts",
        url: publicAudioAssetUrl(request, artifact.url),
        format: "audio/mpeg",
        cache: artifact.cached ? "hit" : "miss",
        cacheKey: artifact.cacheKey,
        providerId: artifact.providerId,
        quality: artifact.quality,
        languageCode,
        purpose,
      },
    });
    response.headers.set("X-Platform-Cache", artifact.cached ? "hit" : "miss");
    response.headers.set(
      "Server-Timing",
      `route.total;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`,
    );
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_audio_quality") return reply({ error: "invalid_audio_quality" }, 400);
    const failure = providerErrorResponse(error);
    const response = reply({ status: "failed", error: { code: failure.payload.error, message: failure.payload.error }, ...(failure.payload.retryAfterMs ? { retryAfterMs: failure.payload.retryAfterMs } : {}) }, failure.status);
    if (failure.payload.retryAfterMs) response.headers.set("Retry-After", String(Math.ceil(failure.payload.retryAfterMs / 1000)));
    return response;
  }
}
