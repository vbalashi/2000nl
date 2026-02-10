module.exports = [
  {
    id: "de_vaak_pos_disambiguation",
    targetLang: "ru",
    word: {
      headword: "vaak",
      // Intentionally "wrong" article to catch cases where the prompt/model over-trusts it.
      gender: "de",
      part_of_speech: "bw", // bijwoord (adverb)
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
    expectations:
      "Should translate as adverb ('часто'), not as a noun. Should not invent an unrelated definition or POS.",
  },
  {
    id: "hoeven_negative_context",
    targetLang: "ru",
    word: {
      headword: "hoeven",
      gender: "",
      part_of_speech: "ww", // werkwoord (verb)
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
    expectations:
      "In negative examples, should render as 'не нужно/не обязан/нет необходимости', not a misleading primary sense like 'нуждаться'.",
  },
  {
    id: "kermis_idiom_not_literal",
    targetLang: "ru",
    word: {
      headword: "kermis",
      gender: "de",
      part_of_speech: "zn", // zelfstandig naamwoord (noun)
      raw: {
        meanings: [
          {
            definition: "jaarmarkt met attracties; (kermis) fair/carnival",
            context: "Zelfstandig naamwoord; kan ook figuurlijk gebruikt worden voor 'chaos/drukte'.",
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
    expectations:
      "Idiom should be translated idiomatically (chaos/ruckus), not word-for-word as if it literally means a fair is here.",
  },
];

