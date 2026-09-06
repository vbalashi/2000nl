import type {
  PlatformContentNodeV2,
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
} from "../../../../../packages/shared/types/platformV2";
import {
  gateFurnitureEntry,
  gateLongHeadwordGroup,
  gateSingleSenseGroup,
} from "@/lib/platform/fixtures/senseCardV1GateFixture";

export type ReadingFixtureKey = "short" | "long" | "long-word";

type ReadingFixture = {
  group: PlatformHeadwordGroupV2;
  entry: PlatformSenseCardEntryV2;
};

const longContent = [
  [
    "definition",
    "een meubelstuk waarop je met meer personen kunt zitten, meestal met een rugleuning en soms met armleuningen",
    "предмет мебели, на котором могут сидеть несколько человек, обычно со спинкой и иногда с подлокотниками",
  ],
  [
    "definition",
    "de plaats of rij zitplaatsen die zo'n meubelstuk inneemt in een kamer, wachtkamer of openbare ruimte",
    "место или ряд сидений, который такой предмет мебели занимает в помещении, зале ожидания или общественном месте",
  ],
  [
    "usage-pattern",
    "op de bank zitten terwijl je samen naar een programma, film of gesprek luistert",
    "сидеть на диване, пока вы вместе смотрите передачу, фильм или слушаете разговор",
  ],
  [
    "usage-pattern",
    "iemand op de bank laten zitten als je hem of haar rustig wilt ontvangen",
    "пригласить кого-то сесть на диван, если вы хотите спокойно его или её принять",
  ],
  [
    "example",
    "Na het eten gingen de kinderen op de bank zitten om samen een verhaal te lezen.",
    "После ужина дети сели на диван, чтобы вместе прочитать рассказ.",
  ],
  [
    "example",
    "De oude bank stond dicht bij het raam, zodat er in de middag veel licht op viel.",
    "Старый диван стоял рядом с окном, поэтому днём на него падало много света.",
  ],
  [
    "example",
    "Zij schoof een kussen opzij en maakte plaats voor haar bezoek.",
    "Она отодвинула подушку и освободила место для своего гостя.",
  ],
  [
    "idiom",
    "door de bank genomen — wanneer je naar het geheel kijkt en uitzonderingen buiten beschouwing laat",
    "в среднем, в общем — если смотреть на картину в целом и не учитывать исключения",
  ],
  [
    "idiom-explanation",
    "De uitdrukking wordt vaak gebruikt om een algemene conclusie voorzichtig te formuleren.",
    "Это выражение часто используют, чтобы осторожно сформулировать общий вывод.",
  ],
  [
    "usage-note",
    "In deze betekenis hoort het woord meestal bij het lidwoord de: de bank.",
    "В этом значении слово обычно употребляется с артиклем de: de bank.",
  ],
] as const;

function cloneEntry(
  source: PlatformSenseCardEntryV2,
  contentNodes: PlatformContentNodeV2[],
  translationsEnabled: boolean,
): PlatformSenseCardEntryV2 {
  return {
    ...source,
    contentNodes: contentNodes.map((node) => ({
      ...node,
      translations: translationsEnabled ? node.translations : [],
    })),
    translation: translationsEnabled ? source.translation : null,
  };
}

function makeLongContent(source: PlatformSenseCardEntryV2) {
  const nodes = source.contentNodes.filter((node) => node.kind !== "definition").map((node) => ({
    ...node,
    translations: node.translations.map((translation) => ({ ...translation })),
  }));
  const next = longContent.map(([kind, text, translation], index) => {
    const contentNodeId = `reading-long-${kind}-${index}`;
    const sourceTextFingerprint = `reading-size-${index + 1}`;
    return {
      contentNodeId,
      parentContentNodeId: null,
      kind,
      order: 10 + index,
      text,
      sourceTextFingerprint,
      translations: [
        {
          translationId: `${contentNodeId}-ru`,
          targetLanguageCode: "ru",
          status: "ready" as const,
          text: translation,
          sourceTextFingerprint,
          translationPolicyVersion: "reading-size-prototype-v1",
        },
      ],
    } satisfies PlatformContentNodeV2;
  });
  return [...next, ...nodes];
}

const shortEntry = cloneEntry(gateFurnitureEntry, gateFurnitureEntry.contentNodes, true);
const longEntry = cloneEntry(
  gateFurnitureEntry,
  makeLongContent(gateFurnitureEntry),
  true,
);

export const readingSizePrototypeFixtures: Record<ReadingFixtureKey, ReadingFixture> = {
  "long-word": {
    group: { ...gateLongHeadwordGroup, entries: [shortEntry] },
    entry: shortEntry,
  },
  short: {
    group: {
      ...gateSingleSenseGroup,
      entries: [shortEntry],
    },
    entry: shortEntry,
  },
  long: {
    group: {
      ...gateSingleSenseGroup,
      headwordGroupId: "reading-size-long-content",
      entries: [longEntry],
    },
    entry: longEntry,
  },
};

export function withReadingTranslations(
  fixture: ReadingFixture,
  translationsEnabled: boolean,
): ReadingFixture {
  const entry = cloneEntry(
    fixture.entry,
    fixture.entry.contentNodes,
    translationsEnabled,
  );
  return {
    group: { ...fixture.group, entries: [entry] },
    entry,
  };
}
