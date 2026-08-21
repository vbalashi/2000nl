export type TranslationEvalExpectations = {
  requiredSemanticUnits: string[];
  forbiddenSenses: string[];
  primaryText?: {
    required: Array<{
      semanticUnit: string;
      anyOf: string[];
    }>;
    forbidden: Array<{
      sense: string;
      anyOf: string[];
    }>;
  };
  notes?: string;
};

export type TranslationEvalCase = {
  id: string;
  targetLang: string;
  entryId?: string;
  sourceContentFingerprint?: string;
  word: {
    headword: string;
    gender: string;
    part_of_speech: string;
    raw: {
      meanings: Array<{
        definition: string;
        context: string;
        examples: string[];
        idioms: Array<
          | string
          | {
              expression: string;
              explanation: string;
            }
        >;
      }>;
    };
  };
  expectations: TranslationEvalExpectations;
};

export const translationEvalCases: TranslationEvalCase[] = [
  {
    id: "typisch_bn_strange",
    targetLang: "ru",
    entryId: "1b636b1b-0ba1-4f29-a52d-0b45fdbaba8d",
    sourceContentFingerprint:
      "221be689c6ff0b006999786b41d60d36cab5fff2011034949368fc7af3c6fbb9",
    word: {
      headword: "typisch",
      gender: "",
      part_of_speech: "bn",
      raw: {
        meanings: [
          {
            definition: "iets wat typisch is, is vreemd",
            context: "",
            examples: [
              "wat typisch dat we elkaar niet gezien hebben op dat congres!",
            ],
            idioms: [],
          },
        ],
      },
    },
    expectations: {
      requiredSemanticUnits: ["strange, unusual, or remarkable"],
      forbiddenSenses: ["typical or characteristic as the primary sense"],
      primaryText: {
        required: [
          {
            semanticUnit: "strange, unusual, or remarkable",
            anyOf: ["стран", "необыч", "удивительн", "примечательн"],
          },
        ],
        forbidden: [
          {
            sense: "typical or characteristic as the primary sense",
            anyOf: ["типич", "характерн", "свойственн"],
          },
        ],
      },
      notes:
        "The selected dictionary meaning overrides the common context-free headword sense.",
    },
  },
  {
    id: "goed_zn_goods",
    targetLang: "ru",
    word: {
      headword: "goed",
      gender: "het",
      part_of_speech: "zn",
      raw: {
        meanings: [
          {
            definition: "de dingen; de voorwerpen",
            context: "",
            examples: ["de goederen worden vervoerd per schip"],
            idioms: [],
          },
        ],
      },
    },
    expectations: {
      requiredSemanticUnits: ["goods, things, objects, or possessions"],
      forbiddenSenses: [
        "moral good",
        "adjectival good",
        "clothes or textile",
      ],
      primaryText: {
        required: [
          {
            semanticUnit: "goods, things, objects, or possessions",
            anyOf: ["товар", "вещ", "предмет", "имуще"],
          },
        ],
        forbidden: [
          { sense: "moral good", anyOf: ["добро", "благо"] },
          { sense: "adjectival good", anyOf: ["хорош"] },
          {
            sense: "clothes or textile",
            anyOf: ["одежд", "бель", "ткан", "текстил"],
          },
        ],
      },
    },
  },
  {
    id: "goed_zn_moral_good",
    targetLang: "ru",
    word: {
      headword: "goed",
      gender: "het",
      part_of_speech: "zn",
      raw: {
        meanings: [
          {
            definition: "dat wat goed is",
            context: "",
            examples: ["zij heeft veel goed gedaan voor de stad"],
            idioms: [],
          },
        ],
      },
    },
    expectations: {
      requiredSemanticUnits: ["moral good or benefit"],
      forbiddenSenses: ["goods or merchandise", "clothes or textile"],
      primaryText: {
        required: [
          {
            semanticUnit: "moral good or benefit",
            anyOf: ["добро", "благо", "польз"],
          },
        ],
        forbidden: [
          {
            sense: "goods or merchandise",
            anyOf: ["товар", "мерч", "имуще"],
          },
          {
            sense: "clothes or textile",
            anyOf: ["одежд", "бель", "ткан", "текстил"],
          },
        ],
      },
    },
  },
  {
    id: "goed_zn_cloth",
    targetLang: "ru",
    word: {
      headword: "goed",
      gender: "het",
      part_of_speech: "zn",
      raw: {
        meanings: [
          {
            definition: "de stof; de kleren",
            context: "",
            examples: ["het vuile goed kun je in de machine doen"],
            idioms: [],
          },
        ],
      },
    },
    expectations: {
      requiredSemanticUnits: ["clothes, laundry, cloth, or textile"],
      forbiddenSenses: ["moral good", "goods or merchandise"],
      primaryText: {
        required: [
          {
            semanticUnit: "clothes, laundry, cloth, or textile",
            anyOf: ["одежд", "бель", "ткан", "текстил"],
          },
        ],
        forbidden: [
          { sense: "moral good", anyOf: ["добро", "благо"] },
          {
            sense: "goods or merchandise",
            anyOf: ["товар", "мерч", "имуще"],
          },
        ],
      },
    },
  },
  {
    id: "de_vaak_pos_disambiguation",
    targetLang: "ru",
    word: {
      headword: "vaak",
      gender: "de",
      part_of_speech: "bw",
      raw: {
        meanings: [
          {
            definition: "dikwijls; veel keren",
            context: "Bijwoord dat aangeeft dat iets regelmatig gebeurt.",
            examples: ["Ik ben vaak moe na het werk.", "Hij komt hier vaak langs."],
            idioms: [],
          },
        ],
      },
    },
    expectations: {
      requiredSemanticUnits: ["adverb meaning often or frequently"],
      forbiddenSenses: ["noun sense inferred from the article"],
    },
  },
  {
    id: "hoeven_negative_context",
    targetLang: "ru",
    word: {
      headword: "hoeven",
      gender: "",
      part_of_speech: "ww",
      raw: {
        meanings: [
          {
            definition:
              "niet nodig zijn; geen verplichting hebben (meestal met 'niet' of 'geen')",
            context: "Werkwoord dat vaak in ontkennende zinnen gebruikt wordt.",
            examples: ["Je hoeft niet te komen.", "Ik hoef geen koffie."],
            idioms: [],
          },
        ],
      },
    },
    expectations: {
      requiredSemanticUnits: ["lack of necessity or obligation under negation"],
      forbiddenSenses: ["a positive need without negation"],
    },
  },
  {
    id: "kermis_idiom_not_literal",
    targetLang: "ru",
    word: {
      headword: "kermis",
      gender: "de",
      part_of_speech: "zn",
      raw: {
        meanings: [
          {
            definition: "jaarmarkt met attracties; (kermis) fair/carnival",
            context:
              "Zelfstandig naamwoord; kan ook figuurlijk gebruikt worden voor 'chaos/drukte'.",
            examples: ["We gingen gisteren naar de kermis."],
            idioms: [
              {
                expression: "Het is hier kermis!",
                explanation: "Er is hier veel lawaai en drukte; het is chaotisch.",
              },
            ],
          },
        ],
      },
    },
    expectations: {
      requiredSemanticUnits: ["an idiomatic rendering of noise, bustle, or chaos"],
      forbiddenSenses: ["a literal fair or carnival in the idiom"],
    },
  },
];
