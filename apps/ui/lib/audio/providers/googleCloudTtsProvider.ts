import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import type { IAudioProvider } from "../audioProvider";
import type { AudioQuality } from "../types";

type GoogleCloudTtsProviderOptions = {
  voiceName?: string;
};

export class GoogleCloudTtsProvider implements IAudioProvider {
  public readonly id = "google";
  private readonly voiceName?: string;

  constructor(opts: GoogleCloudTtsProviderOptions = {}) {
    this.voiceName = opts.voiceName;
  }

  getQuality(): AudioQuality {
    return "premium";
  }

  async generateAudio(text: string) {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const envApiKey = process.env.GOOGLE_TTS_API_KEY;
    const looksLikeApiKey = Boolean(
      credentialsPath && /^AIza[0-9A-Za-z_-]{20,}$/.test(credentialsPath)
    );
    const apiKey = envApiKey || (looksLikeApiKey ? credentialsPath : undefined);

    if (!apiKey && !credentialsPath) {
      throw new Error(
        "Google TTS is not configured. Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path or GOOGLE_TTS_API_KEY to an API key."
      );
    }

    // Use Dutch language; prefer high-quality voices when configured.
    const languageCode = "nl-NL";
    const preferredVoice =
      this.voiceName || process.env.GOOGLE_TTS_VOICE_PREMIUM || "nl-NL-Wavenet-E";

    const requestBase = {
      input: { text },
      voice: {
        languageCode,
      } as { languageCode: string; name?: string; ssmlGender?: "FEMALE" | "MALE" | "NEUTRAL" },
      audioConfig: {
        audioEncoding: "MP3" as const,
      },
    };

    const tryRequest = async (voiceName?: string) => {
      const request = {
        ...requestBase,
        voice: {
          ...requestBase.voice,
          ...(voiceName ? { name: voiceName } : {}),
        },
      };

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
        return Buffer.from(json.audioContent, "base64");
      }

      const client = new TextToSpeechClient();
      const [response] = await client.synthesizeSpeech(request);
      if (!response.audioContent) {
        throw new Error("No audio content returned from Google TTS");
      }
      const rawAudio = response.audioContent as string | Uint8Array;
      return typeof rawAudio === "string"
        ? Buffer.from(rawAudio, "base64")
        : Buffer.from(rawAudio);
    };

    // Try preferred voice name, then fallback to auto-selected voice by omitting name.
    try {
      const audioMp3 = await tryRequest(preferredVoice);
      return { audioMp3 };
    } catch (err: any) {
      const message = String(err?.message ?? err ?? "");
      // If voice is invalid/unavailable, retry with no specific voice name.
      if (message.toLowerCase().includes("voice")) {
        const audioMp3 = await tryRequest(undefined);
        return { audioMp3 };
      }
      throw err;
    }
  }
}

