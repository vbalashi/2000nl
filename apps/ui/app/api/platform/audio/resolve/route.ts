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
  hasConfiguredPremiumTtsProvider,
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

const MAX_AUDIO_TEXT_LENGTH = 160;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const ALLOWED_PURPOSES = new Set([
  "dictionary-headword",
  "manual-dictionary-card",
  "youtube-phrase-practice",
  "pontix-phrase",
]);

type RateBucket = {
  count: number;
  resetAt: number;
};

const audioResolveRateBuckets = new Map<string, RateBucket>();

async function readJson(request: NextRequest): Promise<AudioResolveBody | null> {
  try {
    return (await request.json()) as AudioResolveBody;
  } catch {
    return null;
  }
}

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

function consumeRateLimit(key: string) {
  const now = Date.now();
  const bucket = audioResolveRateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    audioResolveRateBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    return withPlatformCors(request, auth);
  }
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) return withPlatformCors(request, scopeError);

  const rateLimit = consumeRateLimit(auth.principal.userId);
  if (!rateLimit.allowed) {
    return reply(
      {
        status: "failed",
        error: {
          code: "rate_limited",
          retryAfterMs: rateLimit.retryAfterMs,
        },
      },
      429,
    );
  }

  const body = await readJson(request);
  const text = asString(body?.text);
  const languageCode = asString(body?.languageCode) ?? "nl";
  const purpose = asString(body?.purpose) ?? "dictionary-headword";

  if (!text) return reply({ error: "missing_text" }, 400);
  if (text.length > MAX_AUDIO_TEXT_LENGTH) {
    return reply(
      {
        error: "text_too_long",
        maxLength: MAX_AUDIO_TEXT_LENGTH,
      },
      400,
    );
  }
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
    });
    return reply({
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "invalid_audio_quality") {
      return reply({ error: "invalid_audio_quality" }, 400);
    }
    return reply(
      {
        status: "failed",
        error: {
          code: "audio_generation_failed",
          message,
          configured: hasConfiguredPremiumTtsProvider(),
        },
      },
      502,
    );
  }
}
