import {relatedWordGateGroup} from "./relatedWordGateFixture";
import type {PlatformV2SenseContentNode} from "@/lib/platform/projections/platformV2SenseContent";

/** Independently authored display examples for the release review, never learner data. */
const entry = relatedWordGateGroup.entries[0];
export const reviewIdiom: PlatformV2SenseContentNode = {
  contentNodeId: entry.contentNodes[0].contentNodeId,
  sourceTextFingerprint: entry.contentNodes[0].sourceTextFingerprint,
  parentContentNodeId: null,
  kind: "idiom",
  text: "per slot van rekening",
  translation: "в конце концов",
  literalTranslation: "по закрытии счёта",
  children: [],
};
const englishRelations = ["warm", "glowing hot", "cold"];
export const reviewPrimaryEntry = entry;
export const reviewSecondaryGroup = {
  ...relatedWordGateGroup,
  entries: [{
    ...entry,
    capabilities: [],
    translation: {...entry.translation!, targetLanguageCode: "en", text: "hot"},
    contentNodes: [{...entry.contentNodes[0], translations: [{
      translationId: "review-idiom-en", targetLanguageCode: "en", status: "ready" as const,
      text: "after all", literalText: "at the closing of the account",
      sourceTextFingerprint: entry.contentNodes[0].sourceTextFingerprint,
      translationPolicyVersion: "review-v1",
    }]}],
    wordDetails: {...entry.wordDetails!, lexicalRelations: entry.wordDetails!.lexicalRelations.map((relation, index) => ({
      ...relation,
      translations: [{...relation.translations![0], targetLanguageCode: "en", text: englishRelations[index]}],
    }))},
  }],
};
