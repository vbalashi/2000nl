import type { PlatformSenseCardEntryV2 } from "../../../../packages/shared/types/platformV2";
import type { TrainingMode } from "../types";
import { projectPlatformV2SenseContent } from "../platform/projections/platformV2SenseContent";

export type TrainingCardRenderability =
  | { renderable: true }
  | { renderable: false; reason: "direct-example-missing" };

/**
 * Mirrors the server's content eligibility rule at the prepared-card boundary.
 * Later ordinary meanings need their own root example for direct recall; a
 * nested idiom example belongs to that idiom and is never borrowed as context.
 */
export function evaluateTrainingCardRenderability(
  entry: Pick<PlatformSenseCardEntryV2, "meaningOrdinal" | "contentNodes" | "capabilities">,
  mode: TrainingMode,
): TrainingCardRenderability {
  if (mode !== "word-to-definition" || (entry.meaningOrdinal ?? 1) <= 1) {
    return { renderable: true };
  }

  const { rootNodes } = projectPlatformV2SenseContent(entry);
  const isOrdinaryMeaning = rootNodes.some(
    (node) => node.kind === "definition" && node.text.trim(),
  );
  if (!isOrdinaryMeaning) return { renderable: true };

  const hasOwnedExample = rootNodes.some(
    (node) => node.kind === "example" && node.text.trim(),
  );
  return hasOwnedExample
    ? { renderable: true }
    : { renderable: false, reason: "direct-example-missing" };
}
