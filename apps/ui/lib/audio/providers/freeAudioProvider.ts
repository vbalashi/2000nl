import type { IAudioProvider } from "../audioProvider";
import type { AudioQuality } from "../types";
import { GoogleCloudTtsProvider } from "./googleCloudTtsProvider";

// The "free" provider is the current/default TTS behavior, wrapped behind the
// audio-provider abstraction so we can add premium providers later.
export class FreeAudioProvider implements IAudioProvider {
  public readonly id = "free";

  private readonly impl: GoogleCloudTtsProvider;

  constructor() {
    // Default voice for free tier. Keep it Dutch; allow env override.
    this.impl = new GoogleCloudTtsProvider({
      voiceName:
        process.env.GOOGLE_TTS_VOICE_FREE ||
        process.env.GOOGLE_TTS_VOICE_NAME ||
        "nl-NL-Standard-A",
    });
  }

  getQuality(): AudioQuality {
    return "free";
  }

  async generateAudio(text: string) {
    return this.impl.generateAudio(text);
  }
}

