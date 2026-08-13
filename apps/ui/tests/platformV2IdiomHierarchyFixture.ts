import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
} from "../../../packages/shared/types/platformV2";

type FixtureNode = PlatformSenseCardEntryV2["contentNodes"][number];

function node(
  contentNodeId: string,
  kind: FixtureNode["kind"],
  order: number,
  text: string,
  parentContentNodeId: string | null = null,
): FixtureNode {
  return {
    contentNodeId,
    parentContentNodeId,
    kind,
    order,
    text,
    sourceTextFingerprint: `fingerprint-${contentNodeId}`,
    translations: [],
  };
}

function entry(
  entryId: string,
  contentNodes: FixtureNode[],
): PlatformSenseCardEntryV2 {
  return {
    kind: "sense-card",
    entryId,
    meaningOrdinal: 1,
    partOfSpeech: {
      termId: "part-of-speech.bn",
      messageKey: "partOfSpeech.bn",
      sourceValue: "bn",
    },
    card: {
      cardTypeId: "word-to-definition",
      scheduler: { phase: "reviewing", repeatCount: 1 },
      knownMark: null,
      stateRevision: `state-${entryId}`,
    },
    contentRevision: `content-${entryId}`,
    summaryContentNodeId: `definition-${entryId}`,
    // Intentionally reverse the wire order. Public node identity/order and
    // parentContentNodeId, never array adjacency, own the hierarchy.
    contentNodes: [...contentNodes].reverse(),
    translation: null,
    capabilities: [],
  };
}

function group(
  headwordGroupId: string,
  headword: string,
  senseEntry: PlatformSenseCardEntryV2,
): PlatformHeadwordGroupV2 {
  return {
    headwordGroupId,
    dictionary: {
      dictionaryId: "vandale-nt2",
      sourceLanguageCode: "nl",
      displayName: "Van Dale",
      messageKey: "dictionary.name",
    },
    header: {
      text: headword,
      displayPronunciation: headword,
      partOfSpeech: senseEntry.partOfSpeech,
    },
    senseCount: 1,
    entryCount: 1,
    indicators: [],
    entries: [senseEntry],
  };
}

export const nodigEntry = entry("entry-nodig", [
  node("definition-entry-nodig", "definition", 0, "iets wat nodig is, is noodzakelijk"),
  node("example-nodig-1", "example", 1, "voor goed onderwijs zijn goede docenten nodig"),
  node("example-nodig-2", "example", 2, "ze heeft een fiets nodig om naar school te gaan"),
  node("example-nodig-3", "example", 3, "hij heeft niet de nodige bescherming gekregen"),
  node("idiom-nodig-1", "idiom", 4, "ik moet nodig"),
  node(
    "idiom-explanation-nodig-1",
    "idiom-explanation",
    5,
    "ik voel dat ik dringend naar de wc moet",
    "idiom-nodig-1",
  ),
  node(
    "idiom-nodig-2",
    "idiom",
    6,
    "hij moest zo nodig alleen naar huis fietsen",
  ),
  node(
    "idiom-explanation-nodig-2",
    "idiom-explanation",
    7,
    "hij wilde het, maar het was niet verstandig",
    "idiom-nodig-2",
  ),
]);

export const nodigGroup = group("group-nodig", "nodig", nodigEntry);

export const goedEntry = entry("entry-goed", [
  node("definition-entry-goed", "definition", 0, "dat wat goed is"),
  node("example-goed", "example", 1, "zij heeft veel goed gedaan voor de stad"),
  node(
    "idiom-goed",
    "idiom",
    2,
    "iets komt ten goede aan iemand of iets",
  ),
  node(
    "idiom-explanation-goed",
    "idiom-explanation",
    3,
    "iets is bestemd voor iemand of iets; iets is gunstig voor iemand of iets",
    "idiom-goed",
  ),
  node(
    "idiom-example-goed",
    "example",
    4,
    "het geld dat we met deze actie verdienen, komt ten goede aan de slachtoffers van de brand",
    "idiom-goed",
  ),
]);

export const goedGroup = group("group-goed", "goed", goedEntry);
