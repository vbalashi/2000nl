import type { CSSProperties } from "react";
export const cardSpacings = ["balanced", "airy"] as const;
export type CardSpacing = (typeof cardSpacings)[number];
export function isCardSpacing(value: unknown): value is CardSpacing {
  return cardSpacings.some((v) => v === value);
}
export function cardSpacingStyles(
  value: CardSpacing,
): CSSProperties & Record<`--${string}`, string> {
  const airy = value === "airy";
  return {
    "--account-spacing-pair": String(airy ? 5 : 4),
    "--account-spacing-item": String(airy ? 16 : 12),
    "--account-spacing-section": String(airy ? 26 : 20),
    "--account-spacing-translated": String(airy ? 32 : 24),
    "--account-spacing-rail": String(airy ? 5 : 3),
  };
}
