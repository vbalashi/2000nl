import type { IAudioProvider } from "../audioProvider";
import type { AudioQuality } from "../types";

type AzureTtsProviderOptions = {
  voiceName?: string;
  region?: string;
  endpoint?: string;
  outputFormat?: string;
};

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export class AzureTtsProvider implements IAudioProvider {
  public readonly id = "azure";

  private readonly voiceName?: string;
  private readonly region?: string;
  private readonly endpoint?: string;
  private readonly outputFormat?: string;

  constructor(opts: AzureTtsProviderOptions = {}) {
    this.voiceName = opts.voiceName;
    this.region = opts.region;
    this.endpoint = opts.endpoint;
    this.outputFormat = opts.outputFormat;
  }

  getQuality(): AudioQuality {
    return "premium";
  }

  async generateAudio(text: string) {
    const key = process.env.AZURE_SPEECH_KEY || process.env.AZURE_TTS_API_KEY;
    const region = this.region || process.env.AZURE_SPEECH_REGION;
    const endpoint =
      this.endpoint ||
      process.env.AZURE_TTS_ENDPOINT ||
      (region ? `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1` : undefined);

    if (!key || !endpoint) {
      throw new Error(
        "Azure TTS is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (or AZURE_TTS_ENDPOINT)."
      );
    }

    // Dutch (Netherlands) neural voices. Allow env override; fallback to a small known-good set.
    const preferredVoice =
      this.voiceName || process.env.AZURE_TTS_VOICE_PREMIUM || "nl-NL-FennaNeural";
    const fallbackVoices = [
      preferredVoice,
      "nl-NL-MaartenNeural",
      "nl-NL-FennaNeural",
    ].filter((v, i, arr) => v && arr.indexOf(v) === i);

    const outputFormat =
      this.outputFormat ||
      process.env.AZURE_TTS_OUTPUT_FORMAT ||
      // MP3 output for compatibility with existing playback pipeline.
      "audio-24khz-160kbitrate-mono-mp3";

    const userAgent = (process.env.AZURE_TTS_USER_AGENT || "2000nl-ui").slice(0, 200);
    const escapedText = escapeXml(text);

    const trySynthesize = async (voiceName: string) => {
      const ssml = `<speak version="1.0" xml:lang="nl-NL" xmlns="http://www.w3.org/2001/10/synthesis"><voice name="${voiceName}">${escapedText}</voice></speak>`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": outputFormat,
          "User-Agent": userAgent,
        },
        body: ssml,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Azure TTS API error: ${res.status} ${errText}`.trim());
      }

      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    };

    let lastErr: unknown;
    for (const voiceName of fallbackVoices) {
      try {
        const audioMp3 = await trySynthesize(voiceName);
        return { audioMp3 };
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message ?? err ?? "");
        // Retry on voice-related errors with a different voice.
        if (!msg.toLowerCase().includes("voice")) {
          break;
        }
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Azure TTS failed"));
  }
}

