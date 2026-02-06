import { NextRequest, NextResponse } from "next/server";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { resolveUiPublicDir } from "@/lib/resolveUiPublicDir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache directory for TTS audio files (must live under `public/` to be served as `/audio/tts/...`).
const CACHE_DIR =
  process.env.TTS_CACHE_DIR ||
  path.join(resolveUiPublicDir(process.cwd()), "audio", "tts");

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
  const filePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);
  try {
    await fs.access(filePath);
    return `/audio/tts/${cacheKey}.mp3`;
  } catch {
    return null;
  }
}

/**
 * Generate TTS audio using Google Cloud Text-to-Speech
 */
async function generateTTS(text: string, cacheKey: string): Promise<string> {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const envApiKey = process.env.GOOGLE_TTS_API_KEY;
  const looksLikeApiKey = Boolean(credentialsPath && /^AIza[0-9A-Za-z_-]{20,}$/.test(credentialsPath));
  const apiKey = envApiKey || (looksLikeApiKey ? credentialsPath : undefined);

  if (!apiKey && !credentialsPath) {
    throw new Error(
      "Google TTS is not configured. Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path or GOOGLE_TTS_API_KEY to an API key."
    );
  }

  // Configure request
  const request = {
    input: { text },
    voice: {
      languageCode: "nl-NL",
      name: "nl-NL-Wavenet-E", // High-quality Dutch female voice
      ssmlGender: "FEMALE" as const,
    },
    audioConfig: {
      audioEncoding: "MP3" as const,
    },
  };

  let audioContent: Buffer;

  if (apiKey) {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google TTS API error: ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as { audioContent?: string };
    if (!json.audioContent) {
      throw new Error("No audio content returned from Google TTS");
    }
    audioContent = Buffer.from(json.audioContent, "base64");
  } else {
    // Initialize client using Application Default Credentials
    const client = new TextToSpeechClient();
    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error("No audio content returned from Google TTS");
    }
    const rawAudio = response.audioContent as string | Uint8Array;
    audioContent =
      typeof rawAudio === "string"
        ? Buffer.from(rawAudio, "base64")
        : Buffer.from(rawAudio);
  }

  // Ensure cache directory exists
  await fs.mkdir(CACHE_DIR, { recursive: true });

  // Save to cache
  const filePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);
  await fs.writeFile(filePath, audioContent);

  return `/audio/tts/${cacheKey}.mp3`;
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

    return NextResponse.json(
      {
        error: message,
        configured: Boolean(
          process.env.GOOGLE_APPLICATION_CREDENTIALS ||
          process.env.GOOGLE_TTS_API_KEY
        )
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
