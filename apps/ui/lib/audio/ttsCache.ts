import { assertProviderInput, ProviderWorkError, providerWorkIdentity, readProviderArtifact, runProviderWork } from "../providers/providerSafety";
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

const sharedIdentity = (cacheKey: string) => providerWorkIdentity(["tts-cache-v1", cacheKey]);
const sharedKind = (cacheKey: string) => cacheKey.length === 64 ? "tts-entry" as const : "tts-public" as const;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
async function writeLocalAudio(cacheKey: string, audio: Buffer) {
  const { nestedDir, nestedPath } = getCachePaths(cacheKey);
  await fs.mkdir(nestedDir, { recursive: true });
  const temporary = `${nestedPath}.${crypto.randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, audio); await fs.rename(temporary, nestedPath); }
  finally { await fs.unlink(temporary).catch(() => {}); }
}
export async function getCachedAudio(cacheKey: string): Promise<string | null> {
  return await readCachedAudio(cacheKey) ? getCacheUrl(cacheKey) : null;
}
export async function readCachedAudio(cacheKey: string): Promise<Buffer | null> {
  const { nestedPath, legacyPath } = getCachePaths(cacheKey);
  try { return await fs.readFile(nestedPath); } catch { /* try legacy/shared storage */ }
  try {
    const audio = await fs.readFile(legacyPath);
    await writeLocalAudio(cacheKey, audio);
    await fs.unlink(legacyPath).catch(() => {});
    return audio;
  } catch { /* another replica may own the artifact */ }
  const artifact = await readProviderArtifact(sharedKind(cacheKey), sharedIdentity(cacheKey));
  if (typeof artifact?.audioBase64 !== "string") return null;
  const audio = Buffer.from(artifact.audioBase64, "base64");
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new ProviderWorkError("audio_generation_failed", 502);
  await writeLocalAudio(cacheKey, audio).catch(() => {});
  return audio;
}
async function generateSharedAudio(text: string, cacheKey: string, provider: IAudioProvider, accountId: string) {
  const inputCharacters = assertProviderInput("audio", [text]);
  const input = {
    kind: sharedKind(cacheKey), identity: sharedIdentity(cacheKey), accountId, inputCharacters,
    execute: async () => {
      const { audioMp3 } = await provider.generateAudio(text);
      if (!audioMp3.length || audioMp3.length > MAX_AUDIO_BYTES) throw new Error("invalid_audio_output");
      return { audioBase64: audioMp3.toString("base64") };
    },
  };
  let work = await runProviderWork(input);
  // Coalesce short misses across replicas; longer work gives a bounded retry response.
  const waitUntil = Date.now() + 2000;
  while (work.status === "pending" && Date.now() < waitUntil) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const ready = await readProviderArtifact(input.kind, input.identity);
    if (typeof ready?.audioBase64 === "string") { work = { status: "ready", result: { audioBase64: ready.audioBase64 }, cached: true }; break; }
  }
  if (work.status === "pending") throw new ProviderWorkError("audio_pending", 503, 1000);
  const audio = Buffer.from(work.result.audioBase64, "base64");
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new ProviderWorkError("audio_generation_failed", 502);
  // Fenced publication precedes all local files.
  await writeLocalAudio(cacheKey, audio).catch(() => {});
  return { audio, cached: work.cached };
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
  accountId: string;
}): Promise<TtsAudioArtifact> {
  const text = params.text.trim();
  assertProviderInput("audio", [text]);
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

  const generated = await generateSharedAudio(text, cacheKey, provider, params.accountId);
  const url = getCacheUrl(cacheKey);
  return {
    url,
    cached: generated.cached,
    cacheKey,
    quality,
    providerId,
  };
}

/** Entry audio has a separate namespace that the public 16-character TTS GET
 * cannot serve. Callers must authorize before work and again before delivery.
 */
export async function resolvePrivateEntryTtsAudio(text: string, accountId: string) {
  assertProviderInput("audio", [text]);
  const { provider, quality, providerId } = resolveTtsProvider();
  const cacheKey = crypto.createHash("sha256").update(JSON.stringify(["private-entry-audio-v1",quality,providerId,text.trim()])).digest("hex");
  const cached = await readCachedAudio(cacheKey);
  if (cached) return { audio: cached, cached: true };
  return generateSharedAudio(text.trim(), cacheKey, provider, accountId);
}
