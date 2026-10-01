import type { CSSProperties } from "react";

/** Shared proportional presentation scale; storage IDs are adapted explicitly below. */
export const textSizes = [
  {
    id: "standard",
    label: "A",
    name: "Standard",
    reading: 1,
    ui: 1,
    display: 1,
  },
  {
    id: "larger",
    label: "A+",
    name: "Larger",
    reading: 1.25,
    ui: 1.15,
    display: 1.08,
  },
  {
    id: "large",
    label: "A++",
    name: "Large",
    reading: 1.5,
    ui: 1.3,
    display: 1.18,
  },
  {
    id: "extra",
    label: "A+++",
    name: "Extra large",
    reading: 2,
    ui: 1.5,
    display: 1.3,
  },
] as const;
export type TextSize = (typeof textSizes)[number]["id"];
export function normalizeTextSize(value: unknown): TextSize {
  if (value === "normal") return "standard";
  if (value === "largest") return "large";
  return textSizes.find((size) => size.id === value)?.id ?? "standard";
}
export function textSizeStyles(
  size: TextSize,
): CSSProperties & Record<`--${string}`, string> {
  const scale = textSizes.find((item) => item.id === size)!;
  const rem = (base: number, factor: number) => `${(base * factor) / 16}rem`;
  const vars: Record<`--${string}`, string> = {};
  const ui = {
    label: 11,
    caption: 12,
    small: 13,
    body: 14,
    "body-lg": 16,
    lead: 18,
    "title-sm": 20,
    title: 24,
    page: 28,
  };
  for (const [role, base] of Object.entries(ui))
    vars[`--practice-text-${role}`] = rem(base, scale.ui);
  for (const [role, base] of Object.entries({
    number: 32,
    headword: 36,
    display: 44,
  }))
    vars[`--practice-text-${role}`] = rem(base, scale.display);
  for (const [role, base] of Object.entries({
    caption: 12,
    small: 13,
    body: 14,
    literary: 16,
    forms: 18,
    definition: 20,
    prompt: 28,
  }))
    vars[`--practice-reading-${role}`] = rem(base, scale.reading);
  // Owner decision: the forms line stays below the headword on the largest scale.
  vars["--practice-reading-forms"] = rem(18, Math.min(scale.reading, 1.6));
  vars["--practice-definition-size"] = vars["--practice-reading-definition"];
  vars["--practice-literary-size"] = vars["--practice-reading-literary"];
  return vars;
}

/** Preserve the ordering of the existing account profiles; prototype IDs are distinct. */
export const accountTextSize = {
  normal: "standard",
  large: "larger",
  largest: "large",
  extra: "extra",
} as const;
export function accountTextSizeStyles(
  size: keyof typeof accountTextSize,
): CSSProperties & Record<`--${string}`, string> {
  const styles = textSizeStyles(accountTextSize[size]);
  // Nested article/theme roots resolve these inherited aliases instead of resetting
  // the account scale to their default sizes. Prototypes retain their own styles.
  const scale = textSizes.find((item) => item.id === accountTextSize[size])!;
  const reading = (base: number) => `${(base * scale.reading) / 16}rem`;
  const display = (base: number) => `${(base * scale.display) / 16}rem`;
  const legacy = {
    "--reading-body-size": reading(16),
    "--reading-literary-size": reading(16),
    "--reading-hint-size": reading(18),
    "--reading-hint-leading": reading(28),
    "--reading-nested-size": reading(13),
    "--reading-translation-size": reading(13),
    "--reading-translation-emphasis-size": reading(15),
    "--reading-body-prompt-size": `clamp(${1.55 * scale.reading}rem, ${5 * scale.reading}cqi, ${2.4 * scale.reading}rem)`,
    "--reading-headword-face-size": display(48),
    "--reading-headword-answer-size": display(44),
    "--reading-headword-long-size": display(32),
    "--reading-headword-long-size-sm": display(40),
  };
  return {
    ...legacy,
    ...Object.fromEntries(
      Object.entries(styles).flatMap(([key, value]) => [
        [key, value],
        [key.replace("--practice-", "--account-practice-"), value],
      ]),
    ),
  };
}
