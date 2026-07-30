import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { SenseCardV2 } from "@/components/platform-v2/SenseCardV2";
import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
} from "../../../packages/shared/types/platformV2";

const entry: PlatformSenseCardEntryV2 = {
  kind: "sense-card",
  entryId: "entry-bank",
  meaningOrdinal: 1,
  partOfSpeech: {
    termId: "part-of-speech.zn",
    messageKey: "partOfSpeech.zn",
    sourceValue: "zn",
  },
  card: {
    cardTypeId: "word-to-definition",
    scheduler: { phase: "learning", repeatCount: 3 },
    knownMark: null,
    stateRevision: "state-1",
  },
  contentRevision: "content-1",
  summaryContentNodeId: "definition-1",
  contentNodes: [
    {
      contentNodeId: "definition-1",
      parentContentNodeId: null,
      kind: "definition",
      order: 0,
      text: "een meubelstuk waarop je met meer personen kunt zitten",
      sourceTextFingerprint: "fingerprint-definition",
      translations: [
        {
          translationId: "translation-definition",
          targetLanguageCode: "en",
          status: "ready",
          text: "a piece of furniture that seats several people",
          sourceTextFingerprint: "fingerprint-definition",
          translationPolicyVersion: "policy-1",
        },
      ],
    },
    {
      contentNodeId: "example-1",
      parentContentNodeId: null,
      kind: "example",
      order: 1,
      text: "Margriet en Ellie zaten op de bank televisie te kijken.",
      sourceTextFingerprint: "fingerprint-example",
      translations: [
        {
          translationId: "translation-example",
          targetLanguageCode: "en",
          status: "ready",
          text: "Margriet and Ellie were watching television on the sofa.",
          sourceTextFingerprint: "fingerprint-example",
          translationPolicyVersion: "policy-1",
        },
      ],
    },
  ],
  translation: {
    translationId: "translation-entry",
    entryId: "entry-bank",
    targetLanguageCode: "en",
    status: "ready",
    text: "bench · sofa",
    sourceContentFingerprint: "content-fingerprint",
    translationPolicyVersion: "policy-1",
    isFresh: true,
  },
  capabilities: [
    {
      actionId: "mark-known",
      elementId: "sense-card.known.mark",
      messageKey: "senseCard.known.mark",
      target: {
        kind: "sense-card",
        entryId: "entry-bank",
        cardTypeId: "word-to-definition",
        stateRevision: "state-1",
      },
    },
    ...(["fail", "hard", "success", "easy"] as const).map((reviewResult) => ({
      actionId: "review-card" as const,
      elementId: `sense-card.review.${reviewResult}`,
      messageKey:
        reviewResult === "success"
          ? "senseCard.review.success"
          : `senseCard.review.${reviewResult}`,
      target: {
        kind: "sense-card" as const,
        entryId: "entry-bank",
        cardTypeId: "word-to-definition" as const,
        stateRevision: "state-1",
      },
      reviewResult,
    })),
  ],
};

const group: PlatformHeadwordGroupV2 = {
  headwordGroupId: "group-bank",
  dictionary: {
    dictionaryId: "vandale",
    sourceLanguageCode: "nl",
    displayName: "Van Dale",
    messageKey: "dictionary.name",
  },
  header: {
    text: "bank",
    displayPronunciation: "bank",
    article: "de",
    partOfSpeech: entry.partOfSpeech,
    audio: {
      audioId: "audio-bank",
      actionId: "play-audio",
      contentLanguageCode: "nl",
    },
  },
  senseCount: 1,
  entryCount: 1,
  indicators: [
    {
      indicatorId: "core-vocabulary.nt2-2000",
      value: "true",
      messageKey: "indicator.coreVocabulary.nt22000",
    },
  ],
  entries: [entry],
};

test("renders the approved single-sense hierarchy without a redundant ordinal", () => {
  const { container } = render(
    <SenseCardV2
      group={group}
      entry={entry}
      interfaceLanguage="nl"
      translationVisible={false}
      onToggleTranslation={vi.fn()}
      onPlayAudio={vi.fn()}
      onAction={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "bank" })).toBeInTheDocument();
  expect(screen.getByText("zelfstandig naamwoord")).toBeInTheDocument();
  expect(screen.getByText("1 betekenis")).toBeInTheDocument();
  expect(screen.getByText("2K")).toBeInTheDocument();
  expect(screen.queryByText("bench · sofa")).not.toBeInTheDocument();
  expect(container.querySelector("[data-sense-ordinal]")).toBeNull();
});

test("translation visibility inserts bound entry and node translations", () => {
  const props = {
    group,
    entry,
    interfaceLanguage: "en" as const,
    onToggleTranslation: vi.fn(),
    onPlayAudio: vi.fn(),
    onAction: vi.fn(),
  };
  const { rerender } = render(
    <SenseCardV2 {...props} translationVisible={false} />,
  );

  expect(screen.queryByText("bench · sofa")).not.toBeInTheDocument();
  rerender(<SenseCardV2 {...props} translationVisible />);
  expect(screen.getByText("bench · sofa")).toBeInTheDocument();
  expect(
    screen.getByText("a piece of furniture that seats several people"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Margriet and Ellie were watching television on the sofa.",
    ),
  ).toBeInTheDocument();
});

test("resolves interface copy independently and emits exact capabilities", () => {
  const onAction = vi.fn();
  render(
    <SenseCardV2
      group={group}
      entry={entry}
      interfaceLanguage="ru"
      translationVisible={false}
      onToggleTranslation={vi.fn()}
      onAction={onAction}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Хорошо" }));
  expect(onAction).toHaveBeenCalledWith(
    expect.objectContaining({
      actionId: "review-card",
      reviewResult: "success",
      target: expect.objectContaining({ entryId: "entry-bank" }),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Отметить как знакомое" }));
  expect(onAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ actionId: "mark-known" }),
  );
});
