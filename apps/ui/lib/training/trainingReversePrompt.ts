import type { PlatformV2SenseContentNode } from "@/lib/platform/projections/platformV2SenseContent";

/** Select a recall cue without changing the semantic kind or parent identity.
 * Multiple expressions and example/usage-only senses need their own prompt
 * policy; do not silently turn those into definitions.
 */
export function selectTrainingReversePrompt(
  roots: readonly PlatformV2SenseContentNode[],
): PlatformV2SenseContentNode | undefined {
  const definition = roots.find(
    (node) => node.kind === "definition" && node.text.trim(),
  );
  if (definition) return definition;

  const idioms = roots.filter((node) => node.kind === "idiom");
  if (idioms.length !== 1 || !idioms[0].text.trim()) return undefined;
  return idioms[0].children.find(
    (node) =>
      node.kind === "idiom-explanation" &&
      node.parentContentNodeId === idioms[0].contentNodeId &&
      node.text.trim(),
  );
}
