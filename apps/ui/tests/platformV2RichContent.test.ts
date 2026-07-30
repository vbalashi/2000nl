import { describe, expect, test } from "vitest";
import {
  extractPlatformV2ContentSections,
  platformV2ContentRevision,
  platformV2HeaderEvidence,
  projectPlatformV2WordDetails,
} from "@/lib/platform/platformV2RichContent";

describe("Platform V2 rich dictionary projection", () => {
  test("projects parser-v2 fields without raw or positional public identity", () => {
    const entry = {
      id: "entry-meester-1",
      headword: "meester",
      raw: {
        pronunciation: "mees·te·res",
        pronunciation_with_stress: "ˈmees·te·res",
        source_identity: { homograph_number: 2 },
        plural: "meesters",
        alternate_headwords: [
          {
            headword: "meesteres",
            gender: "de",
            plural: "meesteressen",
          },
        ],
        meanings: [
          {
            definition: "iemand die de baas is",
            context: "iemand is iets meester",
            examples: ["hij is de situatie meester"],
            idioms: [
              {
                expression: "je meester maken van iets",
                explanation: "iets krijgen door er moeite voor te doen",
                examples: ["zij maakten zich meester van de eerste plaats"],
              },
            ],
            synonyms: ["de heer"],
            antonyms: ["de dienaar"],
            usage_labels: ["formeel"],
            grammar: { verb_forms: ["is geweest"] },
            note: "Ook figuurlijk gebruikt.",
            pronunciation_note: "lange ee",
            cross_references: [{ headword: "meesteres" }],
          },
        ],
      },
    };
    const bindings = [
      {
        contentNodeId: "node-note",
        sourcePath: "raw.meanings[0].note",
        kind: "usage-note" as const,
        sourceTextFingerprint: "note-fingerprint",
      },
    ];

    const sections = extractPlatformV2ContentSections(entry);
    const details = projectPlatformV2WordDetails(entry, bindings);
    expect(platformV2HeaderEvidence(entry)).toEqual({
      displayPronunciation: "ˈmees·te·res",
      pronunciation: "mees·te·res",
      homographNumber: 2,
    });

    expect(sections).toEqual(
      expect.arrayContaining([
        {
          sourcePath: "raw.meanings[0].idioms[0]",
          kind: "idiom",
          text: "je meester maken van iets",
        },
        {
          sourcePath: "raw.meanings[0].idioms[0].explanation",
          kind: "idiom-explanation",
          text: "iets krijgen door er moeite voor te doen",
        },
        {
          sourcePath: "raw.meanings[0].idioms[0].examples[0]",
          kind: "example",
          text: "zij maakten zich meester van de eerste plaats",
        },
        {
          sourcePath: "raw.meanings[0].note",
          kind: "usage-note",
          text: "Ook figuurlijk gebruikt.",
        },
      ]),
    );
    expect(details).toEqual(
      expect.objectContaining({
        entryId: "entry-meester-1",
        lexicalRelations: expect.arrayContaining([
          expect.objectContaining({ kind: "synonym", text: "de heer" }),
          expect.objectContaining({ kind: "antonym", text: "de dienaar" }),
        ]),
        labels: [
          expect.objectContaining({
            messageKey: "wordDetails.usageLabel",
            sourceValue: "formeel",
          }),
        ],
        grammarNotes: [
          expect.objectContaining({ text: "is geweest" }),
        ],
        usageNotes: [
          expect.objectContaining({
            contentNodeId: "node-note",
            text: "Ook figuurlijk gebruikt.",
          }),
        ],
        pronunciationNotes: [
          expect.objectContaining({ text: "lange ee" }),
        ],
        forms: expect.arrayContaining([
          expect.objectContaining({
            kind: expect.objectContaining({
              messageKey: "wordDetails.form.plural",
            }),
            text: "meesters",
          }),
          expect.objectContaining({
            kind: expect.objectContaining({
              messageKey: "wordDetails.form.alternateHeadword",
            }),
            text: "meesteres",
          }),
        ]),
        references: [
          expect.objectContaining({ text: "meesteres" }),
        ],
      }),
    );
    expect(JSON.stringify(details)).not.toContain("raw.meanings");
    expect(JSON.stringify(details)).not.toContain("_raw_html");
  });

  test("keeps rich-content revision stable across source-object key order", () => {
    const sections = [
      {
        sourcePath: "raw.meanings[0].definition",
        kind: "definition" as const,
        text: "woning",
      },
    ];
    const details = {
      entryId: "entry-1",
      lexicalRelations: [],
      labels: [],
      grammarNotes: [],
      usageNotes: [],
      pronunciationNotes: [],
      forms: [],
      references: [],
    };

    expect(
      platformV2ContentRevision("entry-1", sections, details, null),
    ).toBe(platformV2ContentRevision("entry-1", sections, { ...details }, null));
  });
});
