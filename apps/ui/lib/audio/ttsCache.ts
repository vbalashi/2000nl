import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { createAudioProvider } from "@/lib/audio/audioProviderFactory";
import type { IAudioProvider } from "@/lib/audio/audioProvider";
import type { AudioQuality, PremiumAudioProviderId } from "@/lib/audio/types";

export type TtsProviderId = "free" | PremiumAudioProviderId;

export type TtsAudioArtifact = {
  url: string;
  cached: boolean;
  cacheKey: string;
  quality: AudioQuality;
  providerId: TtsProviderId;
};

const CACHE_DIR =
  process.env.TTS_CACHE_DIR ||
  path.join(process.env.TMPDIR || "/tmp", "2000nl-tts-cache");

export function hasConfiguredPremiumTtsProvider() {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_TTS_API_KEY ||
      ((process.env.AZURE_SPEECH_KEY || process.env.AZURE_TTS_API_KEY) &&
        (process.env.AZURE_SPEECH_REGION || process.env.AZURE_TTS_ENDPOINT))
  );
}

export function getCachePaths(cacheKey: string): {
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

export function getCacheUrl(cacheKey: string): string {
  return `/api/tts?key=${cacheKey}`;
}

export function getCacheKey(params: {
  text: string;
  quality: AudioQuality;
  providerId: TtsProviderId;
}): string {
  const input = `${params.quality}:${params.providerId}:${params.text.trim()}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export async function getCachedAudio(cacheKey: string): Promise<string | null> {
  const { nestedPath, legacyPath, nestedDir } = getCachePaths(cacheKey);
  try {
    await fs.access(nestedPath);
    return getCacheUrl(cacheKey);
  } catch {
    try {
      await fs.access(legacyPath);
      await fs.mkdir(nestedDir, { recursive: true });
      await fs.rename(legacyPath, nestedPath).catch(async () => {
        await fs.unlink(legacyPath).catch(() => {});
      });
      return getCacheUrl(cacheKey);
    } catch {
      return null;
    }
  }
}

export async function readCachedAudio(cacheKey: string): Promise<Buffer | null> {
  const { nestedPath, legacyPath, nestedDir } = getCachePaths(cacheKey);
  try {
    return await fs.readFile(nestedPath);
  } catch {
    try {
      const audio = await fs.readFile(legacyPath);
      await fs.mkdir(nestedDir, { recursive: true });
      await fs.rename(legacyPath, nestedPath).catch(async () => {
        await fs.unlink(legacyPath).catch(() => {});
      });
      return audio;
    } catch {
      return null;
    }
  }
}

async function generateTtsAudio(
  text: string,
  cacheKey: string,
  provider: IAudioProvider
): Promise<string> {
  const { audioMp3 } = await provider.generateAudio(text);
  const { nestedDir, nestedPath } = getCachePaths(cacheKey);
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(nestedPath, audioMp3);
  return getCacheUrl(cacheKey);
}

export function resolveTtsProvider(qualityRaw?: unknown) {
  let requestedQuality: AudioQuality | null = null;
  if (qualityRaw !== undefined && qualityRaw !== null) {
    if (qualityRaw === "free" || qualityRaw === "premium") {
      requestedQuality = qualityRaw;
    } else {
      throw new Error("invalid_audio_quality");
    }
  }

  const effectiveQuality: AudioQuality =
    requestedQuality ||
    (process.env.AUDIO_QUALITY_DEFAULT as AudioQuality) ||
    "free";
  const provider = createAudioProvider({ quality: effectiveQuality });
  const providerId: TtsProviderId =
    provider.id === "free" || provider.id === "google" || provider.id === "azure"
      ? provider.id
      : (() => {
          throw new Error(`Unknown audio provider id: ${provider.id}`);
        })();
  return { provider, quality: effectiveQuality, providerId };
}

export async function resolveTtsAudio(params: {
  text: string;
  quality?: unknown;
}): Promise<TtsAudioArtifact> {
  const text = params.text.trim();
  const { provider, quality, providerId } = resolveTtsProvider(params.quality);
  const cacheKey = getCacheKey({ text, quality, providerId });
  const cachedUrl = await getCachedAudio(cacheKey);
  if (cachedUrl) {
    return {
      url: cachedUrl,
      cached: true,
      cacheKey,
      quality,
      providerId,
    };
  }

  const url = await generateTtsAudio(text, cacheKey, provider);
  return {
    url,
    cached: false,
    cacheKey,
    quality,
    providerId,
  };
}
