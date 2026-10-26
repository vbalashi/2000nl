import type { AudioQuality, PremiumAudioProviderId } from "./types";
import type { IAudioProvider } from "./audioProvider";
import { FreeAudioProvider } from "./providers/freeAudioProvider";
import { GoogleCloudTtsProvider } from "./providers/googleCloudTtsProvider";
import { AzureTtsProvider } from "./providers/azureTtsProvider";

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
    let providerId: PremiumAudioProviderId | undefined =
      selection.premiumProviderId ||
      (process.env.PREMIUM_AUDIO_PROVIDER as PremiumAudioProviderId | undefined);

    // If the premium provider isn't explicitly configured, prefer a provider that is
    // actually configured in the environment. This prevents "premium" silently using
    // Google just because it's the default string, even when Azure is set up.
    if (!providerId) {
      const hasAzure = Boolean(
        (process.env.AZURE_SPEECH_KEY || process.env.AZURE_TTS_API_KEY) &&
          (process.env.AZURE_SPEECH_REGION || process.env.AZURE_TTS_ENDPOINT)
      );
      const hasGoogle = Boolean(
        process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_TTS_API_KEY
      );

      if (hasAzure) providerId = "azure";
      else if (hasGoogle) providerId = "google";
      else {
        throw new Error(
          "Premium audio requested, but no premium provider is configured. Set PREMIUM_AUDIO_PROVIDER=google|azure and configure credentials."
        );
      }
    }

    if (providerId === "google") {
      return new GoogleCloudTtsProvider();
    }

    if (providerId === "azure") {
      return new AzureTtsProvider();
    }

    throw new Error(`Unknown premium audio provider: ${providerId}`);
  }

  return new FreeAudioProvider();
}
