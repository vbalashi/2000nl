import type { CSSProperties } from "react";

export const readingSizes = ["normal", "large", "largest"] as const;
export type ReadingSize = (typeof readingSizes)[number];
export type ReadingDevice = "phone" | "desktop";
export type ReadingPreferences = Record<ReadingDevice, ReadingSize>;
export type ReadingStyleVars = CSSProperties & Record<`--${string}`, string>;
export const defaultReadingPreferences: ReadingPreferences = { phone: "normal", desktop: "normal" };

export function normalizeReadingSize(value: unknown): ReadingSize {
  return readingSizes.includes(value as ReadingSize) ? value as ReadingSize : "normal";
}

// Initialization only, never viewport-based. An explicit browser choice wins.
// Client Hints is not supported everywhere; no high-entropy data is requested.
export function detectReadingDevice(nav: { userAgent: string; userAgentData?: { mobile: boolean } }): ReadingDevice {
  if (nav.userAgentData?.mobile) return "phone";
  return /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(nav.userAgent) ? "phone" : "desktop";
}

export const readingSizeStyles: Record<ReadingSize, ReadingStyleVars> = {
  normal: {
    "--reading-body-size": "16px",
    "--reading-body-leading": "1.15",
    "--reading-body-prompt-size": "clamp(1.55rem, 5cqi, 2.4rem)",
    "--reading-literary-size": "16px",
    "--reading-literary-leading": "1.4",
    "--reading-hint-size": "18px",
    "--reading-hint-leading": "28px",
    "--reading-nested-size": "13px",
    "--reading-nested-leading": "1.35",
    "--reading-translation-size": "13px",
    "--reading-translation-leading": "1.35",
    "--reading-translation-emphasis-size": "15px",
    "--reading-headword-face-size": "48px",
    "--reading-headword-answer-size": "44px",
    "--reading-headword-long-size": "32px",
    "--reading-headword-long-size-sm": "40px",
  },
  large: {
    "--reading-body-size": "18px",
    "--reading-body-leading": "1.28",
    "--reading-body-prompt-size": "clamp(1.7rem, 5.4cqi, 2.55rem)",
    "--reading-literary-size": "18px",
    "--reading-literary-leading": "1.5",
    "--reading-hint-size": "20px",
    "--reading-hint-leading": "30px",
    "--reading-nested-size": "14px",
    "--reading-nested-leading": "1.4",
    "--reading-translation-size": "14px",
    "--reading-translation-leading": "1.45",
    "--reading-translation-emphasis-size": "16px",
    "--reading-headword-face-size": "50px",
    "--reading-headword-answer-size": "46px",
    "--reading-headword-long-size": "34px",
    "--reading-headword-long-size-sm": "42px",
  },
  largest: {
    "--reading-body-size": "20px",
    "--reading-body-leading": "1.38",
    "--reading-body-prompt-size": "clamp(1.85rem, 5.8cqi, 2.7rem)",
    "--reading-literary-size": "20px",
    "--reading-literary-leading": "1.55",
    "--reading-hint-size": "22px",
    "--reading-hint-leading": "34px",
    "--reading-nested-size": "15px",
    "--reading-nested-leading": "1.45",
    "--reading-translation-size": "15px",
    "--reading-translation-leading": "1.5",
    "--reading-translation-emphasis-size": "17px",
    "--reading-headword-face-size": "52px",
    "--reading-headword-answer-size": "48px",
    "--reading-headword-long-size": "36px",
    "--reading-headword-long-size-sm": "44px",
  },
};
