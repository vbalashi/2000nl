import { describe, expect, test } from "vitest";

import { projectTrainingCardPresentation } from "@/lib/training/trainingCardPresentation";
import type { TrainingWord } from "@/lib/types";

const trainingWord = (
  overrides: Partial<TrainingWord> & Pick<TrainingWord, "id" | "headword">,
): TrainingWord => ({
  raw: {},
  isFirstEncounter: true,
  ...overrides,
});

describe("projectTrainingCardPresentation", () => {
  test("projects ordered meanings, links, idioms and source ordinals", () => {
    const presentation = projectTrainingCardPresentation(
      trainingWord({
        id: "entry-goed-2",
        headword: "goed",
        part_of_speech: "bn",
        gender: "het",
        meanings_count: 6,
        raw: {
          meaning_id: 2,
          meanings: [
            {
              definition: "dat wat goed is",
              context: "abstract gebruik",
              examples: ["zij heeft veel goed gedaan voor de stad"],
              idioms: [
                {
                  expression: "iets komt ten goede aan iemand of iets",
                  explanation: "iets is gunstig voor iemand of iets",
                },
              ],
              links: [{ label: "stad", headword: "stad" }],
            },
          ],
        },
      }),
    );

    expect(presentation).toMatchObject({
      entryId: "entry-goed-2",
      headword: "goed",
      partOfSpeech: "bn",
      gender: "het",
      meaningCount: 6,
      meaningOrdinal: 2,
    });
    expect(presentation.meanings).toEqual([
      {
        definition: "dat wat goed is",
        context: "abstract gebruik",
        examples: ["zij heeft veel goed gedaan voor de stad"],
        idioms: [
          {
            expression: "iets komt ten goede aan iemand of iets",
            explanation: "iets is gunstig voor iemand of iets",
          },
        ],
        links: [{ label: "stad", headword: "stad" }],
      },
    ]);
  });

  test("preserves idiom-only content without inventing a definition", () => {
    const presentation = projectTrainingCardPresentation(
      trainingWord({
        id: "entry-idiom",
        headword: "goed",
        raw: {
          meanings: [
            {
              definition: "",
              idioms: [
                {
                  expression: "zich te goed doen aan iets",
                  explanation: "iets lekker opeten of opdrinken",
                },
              ],
            },
          ],
        },
      }),
    );

    expect(presentation.meanings[0]).toMatchObject({
      definition: "",
      idioms: [
        {
          expression: "zich te goed doen aan iets",
          explanation: "iets lekker opeten of opdrinken",
        },
      ],
    });
  });

  test("normalizes legacy user-entry fallbacks once below the renderer", () => {
    const presentation = projectTrainingCardPresentation(
      trainingWord({
        id: "entry-user",
        headword: "gedoe",
        raw: {
          translation: { languageCode: "en", text: "hassle" },
          example: {
            source: "Wat een gedoe.",
            translation: "What a hassle.",
          },
          notes: "Personal dictionary entry",
          links: [{ label: "gedoe" }],
        },
      }),
    );

    expect(presentation.meanings).toEqual([
      {
        definition: "hassle",
        context: "Personal dictionary entry",
        examples: ["Wat een gedoe."],
        idioms: [],
        links: [{ label: "gedoe", headword: undefined }],
      },
    ]);
    expect(presentation.meaningCount).toBe(1);
    expect(presentation.meaningOrdinal).toBeUndefined();
  });

  test("falls back to a stable unavailable-definition message", () => {
    const presentation = projectTrainingCardPresentation(
      trainingWord({ id: "entry-empty", headword: "leeg", raw: {} }),
    );

    expect(presentation.meanings[0].definition).toBe(
      "Definitie niet beschikbaar.",
    );
  });

  test("suppresses a duplicate gender article before presentation", () => {
    const presentation = projectTrainingCardPresentation(
      trainingWord({
        id: "entry-article",
        headword: "het goed",
        gender: "het",
        raw: { definition: "bezit" },
      }),
    );

    expect(presentation.gender).toBeUndefined();
  });
});
