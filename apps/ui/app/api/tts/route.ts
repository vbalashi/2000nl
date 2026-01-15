import { NextRequest, NextResponse } from "next/server";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache directory for TTS audio files
const CACHE_DIR = path.join(process.cwd(), "..", "..", "db", "audio", "tts");

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
  // Check if API key is configured
  const hasCredentials =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_TTS_API_KEY;

  if (!hasCredentials) {
    throw new Error("Google TTS is not configured. Please set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_TTS_API_KEY environment variable.");
  }

  // Initialize client
  const client = new TextToSpeechClient();

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

  // Call Google TTS API
  const [response] = await client.synthesizeSpeech(request);

  if (!response.audioContent) {
    throw new Error("No audio content returned from Google TTS");
  }

  // Ensure cache directory exists
  await fs.mkdir(CACHE_DIR, { recursive: true });

  // Save to cache
  const filePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);
  await fs.writeFile(filePath, response.audioContent);

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
