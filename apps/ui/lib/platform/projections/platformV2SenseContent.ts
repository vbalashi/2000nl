import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type {
  PlatformContentNodeKindV2,
  PlatformSemanticTermV2,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../../packages/shared/types/platformV2";
import { firstExactRenderableNodeTranslationV1 } from "../../../../../packages/shared/platform-v2/displayedTranslationArtifactIdentityV1";

export type PlatformV2NodeReportCapability = Extract<
  PlatformSenseCardCapabilityV2,
  { actionId: "report-content" }
>;

export type PlatformV2SenseContentNode = {
  contentNodeId: string;
  parentContentNodeId: string | null;
  kind: PlatformContentNodeKindV2;
  text: string;
  translation?: string;
  reportCapability?: PlatformV2NodeReportCapability;
  children: PlatformV2SenseContentNode[];
};

export type PlatformV2SenseContentProjection = {
  orderedNodes: PlatformV2SenseContentNode[];
  rootNodes: PlatformV2SenseContentNode[];
};

export function projectPlatformV2SenseContent(
  entry: Pick<PlatformSenseCardEntryV2, "capabilities" | "contentNodes">,
): PlatformV2SenseContentProjection {
  const reportByContentNodeId = new Map(
    entry.capabilities.flatMap((candidate) =>
      candidate.actionId === "report-content" &&
      candidate.target.kind === "content-node"
        ? [[candidate.target.contentNodeId, candidate] as const]
        : [],
    ),
  );
  const orderedNodes = [...entry.contentNodes]
    .sort((left, right) => left.order - right.order)
    .map<PlatformV2SenseContentNode>((node) => {
      const translation = firstExactRenderableNodeTranslationV1(
        node.translations,
        node.sourceTextFingerprint,
      )?.text;
      const reportCapability = reportByContentNodeId.get(node.contentNodeId);
      return {
        contentNodeId: node.contentNodeId,
        parentContentNodeId: node.parentContentNodeId,
        kind: node.kind,
        text: node.text,
        ...(translation ? { translation } : {}),
        ...(reportCapability ? { reportCapability } : {}),
        children: [],
      };
    });
  const nodeById = new Map(
    orderedNodes.map((node) => [node.contentNodeId, node] as const),
  );

  for (const node of orderedNodes) {
    if (!node.parentContentNodeId) continue;
    nodeById.get(node.parentContentNodeId)?.children.push(node);
  }

  return {
    orderedNodes,
    rootNodes: orderedNodes.filter(
      (node) =>
        !node.parentContentNodeId || !nodeById.has(node.parentContentNodeId),
    ),
  };
}

export function localizePlatformSemanticTerm(
  term: PlatformSemanticTermV2 | null | undefined,
  interfaceLanguage: OnboardingLanguage,
): string | null {
  if (!term) return null;
  const localized = platformV2Message(interfaceLanguage, term.messageKey);
  return localized === term.messageKey ? (term.sourceValue ?? null) : localized;
}
