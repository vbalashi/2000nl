import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { createAudioProvider } from "@/lib/audio/audioProviderFactory";

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

function getCacheFilePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.mp3`);
}

function getCacheUrl(cacheKey: string): string {
  return `/api/tts?key=${cacheKey}`;
}

/**
 * Generate a deterministic cache key from sentence text
 */
function getCacheKey(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

/**
 * Check if cached audio file exists
 */
async function getCachedAudio(cacheKey: string): Promise<string | null> {
  const filePath = getCacheFilePath(cacheKey);
  try {
    await fs.access(filePath);
    return getCacheUrl(cacheKey);
  } catch {
    return null;
  }
}

async function generateTTS(text: string, cacheKey: string): Promise<string> {
  // The "user setting" will be persisted and read server-side in US-053.3.
  // For now we keep behavior stable by defaulting to the free provider unless
  // deployment config opts into premium.
  const provider = createAudioProvider();

  const { audioMp3 } = await provider.generateAudio(text);

  // Ensure cache directory exists
  await fs.mkdir(CACHE_DIR, { recursive: true });

  // Save to cache
  const filePath = getCacheFilePath(cacheKey);
  await fs.writeFile(filePath, audioMp3);

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

  const filePath = getCacheFilePath(key);
  try {
    const audio = await fs.readFile(filePath);
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = body.text as string | undefined;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'text' parameter" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const trimmedText = text.trim();
    const cacheKey = getCacheKey(trimmedText);

    // Check cache first
    const cachedUrl = await getCachedAudio(cacheKey);
    if (cachedUrl) {
      return NextResponse.json(
        {
          url: cachedUrl,
          cached: true,
          cacheKey
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Generate new audio
    const url = await generateTTS(trimmedText, cacheKey);

    return NextResponse.json(
      {
        url,
        cached: false,
        cacheKey
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
