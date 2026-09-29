import type {CSSProperties} from "react";

/** Presentation-only scale. Account reading preferences retain their existing contract. */
export const textSizes = [
  {id: "standard", label: "A", name: "Standard", reading: 1, ui: 1, display: 1},
  {id: "larger", label: "A+", name: "Larger", reading: 1.25, ui: 1.15, display: 1.08},
  {id: "large", label: "A++", name: "Large", reading: 1.5, ui: 1.3, display: 1.18},
  {id: "extra", label: "A+++", name: "Extra large", reading: 2, ui: 1.5, display: 1.3},
] as const;
export type TextSize = typeof textSizes[number]["id"];
export function normalizeTextSize(value: unknown): TextSize {
  if (value === "normal") return "standard";
  if (value === "largest") return "large";
  return textSizes.find(size => size.id === value)?.id ?? "standard";
}
export function textSizeStyles(size: TextSize): CSSProperties & Record<`--${string}`, string> {
  const scale = textSizes.find(item => item.id === size)!;
  const rem = (base: number, factor: number) => `${base * factor / 16}rem`;
  const vars: Record<`--${string}`, string> = {};
  const ui = {label:11, caption:12, small:13, body:14, "body-lg":16, lead:18, "title-sm":20, title:24, page:28};
  for (const [role, base] of Object.entries(ui)) vars[`--practice-text-${role}`] = rem(base, scale.ui);
  for (const [role, base] of Object.entries({number:32, headword:36, display:44})) vars[`--practice-text-${role}`] = rem(base, scale.display);
  for (const [role, base] of Object.entries({caption:12, small:13, body:14, literary:16, forms:18, definition:20, prompt:28})) vars[`--practice-reading-${role}`] = rem(base, scale.reading);
  vars["--practice-definition-size"] = vars["--practice-reading-definition"];
  vars["--practice-literary-size"] = vars["--practice-reading-literary"];
  return vars;
}
