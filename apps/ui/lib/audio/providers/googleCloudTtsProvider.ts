import { recordProviderConfigurationFault } from "../../providers/providerDiagnostics";
import { providerFetch, providerCancellableCall } from "../../providers/providerTransport";
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
        const response = await providerFetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          }, "google_tts", [...text].length
        );

        if (!response.ok) {
          const errorText = await response.text();
          recordProviderConfigurationFault("google_tts", response.status, errorText);
          throw new Error(`Google TTS API error: ${response.status} ${errorText}`);
        }

        const json = (await response.json()) as { audioContent?: string };
        if (!json.audioContent) {
          throw new Error("No audio content returned from Google TTS");
        }
        return Buffer.from(json.audioContent, "base64");
      }

      const client = new TextToSpeechClient();
      // Preserve GAX cancellation; synthesizeSpeech's generated .then wrapper
      // returns a plain Promise without cancel(). Initialization itself cannot
      // start synthesis, and a deadline reached during init forbids the call.
      await client.initialize();
      let response;
      try {
        [response] = await providerCancellableCall(remainingMs =>
          client.innerApiCalls.synthesizeSpeech(request, { timeout: remainingMs, retry: null }) as Promise<[import("@google-cloud/text-to-speech").protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse]> & { cancel(): void }, "google_tts", [...text].length,
        );
      } finally { void client.close().catch(() => {}); }
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

