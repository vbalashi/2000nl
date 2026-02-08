import type { AudioQuality, PremiumAudioProviderId } from "./types";
import type { IAudioProvider } from "./audioProvider";
import { FreeAudioProvider } from "./providers/freeAudioProvider";
import { GoogleCloudTtsProvider } from "./providers/googleCloudTtsProvider";

export type AudioProviderSelection = {
  /**
   * Represents the user's selected audio quality.
   * Today this is config-driven; the DB-backed user setting is added in US-053.3.
   */
  quality?: AudioQuality;

  /**
   * Which premium provider to use when quality === "premium".
   */
  premiumProviderId?: PremiumAudioProviderId;
};

export function createAudioProvider(selection: AudioProviderSelection = {}): IAudioProvider {
  const quality = selection.quality || (process.env.AUDIO_QUALITY_DEFAULT as AudioQuality) || "free";

  if (quality === "premium") {
    const providerId =
      selection.premiumProviderId ||
      (process.env.PREMIUM_AUDIO_PROVIDER as PremiumAudioProviderId) ||
      "google";

    if (providerId === "google") {
      return new GoogleCloudTtsProvider();
    }

    // Azure provider is implemented in US-053.2.
    throw new Error(`Premium audio provider not implemented: ${providerId}`);
  }

  return new FreeAudioProvider();
}

