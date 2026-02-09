import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { createAudioProvider } from "@/lib/audio/audioProviderFactory";
import type { AudioQuality, PremiumAudioProviderId } from "@/lib/audio/types";
import type { IAudioProvider } from "@/lib/audio/audioProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache directory for generated TTS audio files.
//
// Note: writing to `public/` works in local dev, but production deployments often run on a read-only
// filesystem (or with a `public` path that isn't a real directory). Default to `/tmp` and serve the
// cached audio via this API route's GET handler instead.
const CACHE_DIR =
  process.env.TTS_CACHE_DIR ||
  path.join(process.env.TMPDIR || "/tmp", "2000nl-tts-cache");

function getCachePaths(cacheKey: string): {
  nestedDir: string;
  nestedPath: string;
  legacyPath: string;
} {
  const fileName = `${cacheKey}.mp3`;
  const prefix = cacheKey.slice(0, 2);
  const nestedDir = path.join(CACHE_DIR, prefix);
  return {
    nestedDir,
    nestedPath: path.join(nestedDir, fileName),
    legacyPath: path.join(CACHE_DIR, fileName),
  };
}

function getCacheUrl(cacheKey: string): string {
  return `/api/tts?key=${cacheKey}`;
}

/**
 * Generate a deterministic cache key from sentence text + provider selection.
 *
 * This avoids serving "free" audio to a premium user (or vice versa) because the
 * text hash matches.
 */
function getCacheKey(params: {
  text: string;
  quality: AudioQuality;
  providerId: "free" | PremiumAudioProviderId;
}): string {
  const input = `${params.quality}:${params.providerId}:${params.text.trim()}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Check if cached audio file exists
 */
async function getCachedAudio(cacheKey: string): Promise<string | null> {
  const { nestedPath, legacyPath, nestedDir } = getCachePaths(cacheKey);
  try {
    await fs.access(nestedPath);
    return getCacheUrl(cacheKey);
  } catch {
    // Backward compatibility for older flat cache layout: `CACHE_DIR/<key>.mp3`.
    try {
      await fs.access(legacyPath);
      // Migrate lazily on cache hit.
      await fs.mkdir(nestedDir, { recursive: true });
      await fs
        .rename(legacyPath, nestedPath)
        .catch(async () => {
          // If another process migrated first, best-effort cleanup.
          await fs.unlink(legacyPath).catch(() => {});
        });
      return getCacheUrl(cacheKey);
    } catch {
      return null;
    }
  }
}

async function generateTTS(
  text: string,
  cacheKey: string,
  provider: IAudioProvider
): Promise<string> {
  const { audioMp3 } = await provider.generateAudio(text);

  const { nestedDir, nestedPath } = getCachePaths(cacheKey);
  // Ensure cache directory exists (hash subfolder).
  await fs.mkdir(nestedDir, { recursive: true });

  // Save to cache
  await fs.writeFile(nestedPath, audioMp3);

  return getCacheUrl(cacheKey);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key || !/^[0-9a-f]{16}$/.test(key)) {
    return NextResponse.json(
      { error: "Missing or invalid 'key' parameter" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { nestedPath, legacyPath, nestedDir } = getCachePaths(key);
  try {
    const audio = await fs.readFile(nestedPath);
    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // Backward compatibility for older flat cache layout: `CACHE_DIR/<key>.mp3`.
    try {
      const audio = await fs.readFile(legacyPath);
      // Best-effort lazy migration on read.
      await fs.mkdir(nestedDir, { recursive: true });
      await fs
        .rename(legacyPath, nestedPath)
        .catch(async () => {
          // If another process migrated first, best-effort cleanup.
          await fs.unlink(legacyPath).catch(() => {});
        });

      return new NextResponse(audio, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = body.text as string | undefined;
    const qualityRaw = body.quality as unknown;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'text' parameter" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    let requestedQuality: AudioQuality | null = null;
    if (qualityRaw !== undefined && qualityRaw !== null) {
      if (qualityRaw === "free" || qualityRaw === "premium") {
        requestedQuality = qualityRaw;
      } else {
        return NextResponse.json(
          { error: "Invalid 'quality' parameter (expected 'free' or 'premium')" },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    const trimmedText = text.trim();
    const effectiveQuality: AudioQuality =
      requestedQuality ||
      (process.env.AUDIO_QUALITY_DEFAULT as AudioQuality) ||
      "free";

    // Resolve provider via the same factory used for generation, so cache keys always
    // match the actual provider used (and "premium" prefers a configured backend).
    const provider = createAudioProvider({ quality: effectiveQuality });
    const effectiveProviderId: "free" | PremiumAudioProviderId =
      provider.id === "free"
        ? "free"
        : provider.id === "google" || provider.id === "azure"
          ? provider.id
          : (() => {
              throw new Error(`Unknown audio provider id: ${provider.id}`);
            })();

    const cacheKey = getCacheKey({
      text: trimmedText,
      quality: effectiveQuality,
      providerId: effectiveProviderId,
    });

    // Check cache first
    const cachedUrl = await getCachedAudio(cacheKey);
    if (cachedUrl) {
      return NextResponse.json(
        {
          url: cachedUrl,
          cached: true,
          cacheKey,
          quality: effectiveQuality,
          providerId: effectiveProviderId,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Generate new audio
    const url = await generateTTS(trimmedText, cacheKey, provider);

    return NextResponse.json(
      {
        url,
        cached: false,
        cacheKey,
        quality: effectiveQuality,
        providerId: effectiveProviderId,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "Unknown error");
    console.error("[TTS API] Error:", message);

    const hasGoogle = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_TTS_API_KEY
    );
    const hasAzure = Boolean(
      (process.env.AZURE_SPEECH_KEY || process.env.AZURE_TTS_API_KEY) &&
        (process.env.AZURE_SPEECH_REGION || process.env.AZURE_TTS_ENDPOINT)
    );

    return NextResponse.json(
      {
        error: message,
        configured: hasGoogle || hasAzure,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
