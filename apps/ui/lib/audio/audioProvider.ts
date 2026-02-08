import type { AudioQuality } from "./types";

export type GenerateAudioResult = {
  audioMp3: Buffer;
};

export interface IAudioProvider {
  /**
   * Stable id for logging/analytics and cache versioning.
   * Examples: "free", "google".
   */
  readonly id: string;

  getQuality(): AudioQuality;

  /**
   * Returns synthesized MP3 audio bytes for the given text.
   */
  generateAudio(text: string): Promise<GenerateAudioResult>;
}

