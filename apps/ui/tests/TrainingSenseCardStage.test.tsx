import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import {
  singleSenseEntry,
  singleSenseGroup,
} from "./platformV2TrainingFixture";
import {
  goedEntry,
  goedGroup,
  nodigEntry,
  nodigGroup,
} from "./platformV2IdiomHierarchyFixture";

describe("TrainingSenseCardStage", () => {
  test("renders two nodig idioms and the goed expression hierarchy", () => {
    const nodigModel = buildTrainingSenseCardModel({
      group: nodigGroup,
      entry: nodigEntry,
      interfaceLanguage: "en",
    });
    const { container, rerender } = render(
      <TrainingSenseCardStage
        model={nodigModel}
        mode="word-to-definition"
        interfaceLanguage="en"
        onAction={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));

    const nodigIdioms = container.querySelector('[data-section="idioms"]');
    expect(nodigIdioms).toBeInTheDocument();
    expect(
      nodigIdioms?.querySelector('[data-testid="sense-section-header"]'),
    ).toHaveTextContent("Idioms2");
    expect(nodigIdioms?.querySelectorAll('[data-content-kind="idiom"]')).toHaveLength(2);
    expect(
      nodigIdioms?.querySelectorAll('[data-content-kind="idiom-explanation"]'),
    ).toHaveLength(2);

    const goedModel = buildTrainingSenseCardModel({
      group: goedGroup,
      entry: goedEntry,
      interfaceLanguage: "en",
    });
    const onAction = vi.fn();
    rerender(
      <TrainingSenseCardStage
        model={goedModel}
        mode="word-to-definition"
        interfaceLanguage="en"
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));

    const expression = container.querySelector('[data-content-node-id="idiom-goed"]');
    const explanation = container.querySelector(
      '[data-content-node-id="idiom-explanation-goed"]',
    );
    const example = container.querySelector(
      '[data-content-node-id="idiom-example-goed"]',
    );
    expect(expression).toContainElement(explanation as HTMLElement);
    expect(expression).toContainElement(example as HTMLElement);
    expect(expression?.querySelector("p")).toHaveClass("italic");
    expect(explanation?.querySelector("p")).not.toHaveClass("italic");
    expect(example?.querySelector("p")).toHaveClass("italic");
    expect(screen.queryByRole("button", { name: /Report:/ })).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });
  test("keeps the audio control in the upper-left corner away from long headwords", () => {
    const baseModel = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });
    render(
      <TrainingSenseCardStage
        model={{
          ...baseModel,
          headword: "ar·beids·on·ge·schikt·heids·ver·ze·ke·ring",
        }}
        mode="word-to-definition"
        interfaceLanguage="en"
        onPlayAudio={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    const corner = screen.getByTestId("training-card-audio-corner");
    expect(corner).toContainElement(screen.getByRole("button", { name: "Play audio" }));
    expect(screen.getByTestId("sense-card-headword-lockup")).not.toContainElement(
      screen.getByRole("button", { name: "Play audio" }),
    );
  });
  test("renders Report as an actionable, keyboard-focusable button", () => {
    const baseModel = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });
    const onAction = vi.fn();
    const onReport = vi.fn();

    render(
      <TrainingSenseCardStage
        model={baseModel}
        mode="word-to-definition"
        interfaceLanguage="en"
        reportAction={<button type="button" onClick={onReport} className="hover:bg-slate-100 focus-visible:ring-2">Report</button>}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    const report = screen.getByRole("button", { name: "Report" });
    expect(report.tagName).toBe("BUTTON");
    expect(report).toHaveClass("hover:bg-slate-100");
    expect(report).toHaveClass("focus-visible:ring-2");
    report.focus();
    expect(report).toHaveFocus();
    fireEvent.click(report);
    expect(onReport).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
  });

  test("keeps one exact sense hidden on Face, supports a hint, then reveals Answer actions", () => {
    const onPlayAudio = vi.fn();
    const onAction = vi.fn();
    const baseModel = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });
    const model = {
      ...baseModel,
      definitions: [
        ...baseModel.definitions,
        {
          contentNodeId: "usage-pattern-1",
          parentContentNodeId: null,
          kind: "usage-pattern" as const,
          text: "iemand de hand geven",
          translation: "to shake someone's hand",
          children: [],
        },
      ],
      examples: [
        ...baseModel.examples,
        {
          contentNodeId: "idiom-1",
          parentContentNodeId: null,
          kind: "idiom" as const,
          text: "door de bank genomen",
          translation: "on average",
          children: [],
        },
      ],
    };

    const { container } = render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="nl"
        onPlayAudio={onPlayAudio}
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("heading", { name: "hand" })).toBeInTheDocument();
    expect(screen.queryByText("Wat betekent dit woord?")).not.toBeInTheDocument();
    const headword = screen.getByRole("heading", { name: "hand" });
    const faceAudio = screen.getByRole("button", { name: "Afspelen" });
    expect(faceAudio).toBeInTheDocument();
    expect(screen.getByTestId("training-card-audio-corner")).toContainElement(
      faceAudio,
    );
    expect(
      headword.closest("[data-testid='sense-card-headword-lockup']"),
    ).not.toContainElement(faceAudio);
    expect(screen.queryByRole("button", { name: "Vertalen" })).not.toBeInTheDocument();
    const faceShell = screen.getByTestId("training-sense-card-shell");
    expect(faceShell.className).toContain("flex-1");
    expect(faceShell.className).toContain("max-h-[500px]");
    expect(faceShell.className).not.toContain("sm:max-h-[500px]");
    expect(faceShell.className).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:max-h-[500px]",
    );
    expect(faceShell.className).toContain("bg-slate-50");
    expect(faceShell.className).toContain("dark:bg-[#1d222b]");
    const dock = screen.getByTestId("training-sense-card-dock");
    expect(dock.className).toContain("shrink-0");
    expect(dock.className).toContain("h-11");
    expect(screen.getByRole("button", { name: "Antwoord tonen" })).toHaveClass(
      "h-11",
    );
    expect(
      screen.queryByText(model.definitions[0].text),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Goed" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Afspelen" }));
    expect(onPlayAudio).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Hint tonen" }));
    const hint = screen.getByText(model.examples[0].text).closest("aside");
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveClass("absolute");
    expect(
      screen.queryByText(model.definitions[0].text),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    expect(screen.getByTestId("training-sense-card-shell")).toBe(faceShell);
    expect(screen.getByText(model.definitions[0].text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Goed" })).toBeInTheDocument();
    expect(screen.getByText("2K")).toHaveClass("dark:text-indigo-200");
    expect(
      screen.queryByRole("button", { name: "Melden" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Hoe goed ken je deze betekenis?"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Hoe goed ken je deze betekenis?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Goed" })).toHaveClass(
      "sm:h-11",
    );
    expect(screen.queryByText("Betekenis")).not.toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="examples"] [data-testid="sense-section-header"] svg',
      ),
    ).toBeInTheDocument();
    const usageSection = container.querySelector('[data-section="usage"]');
    const examplesSection = container.querySelector(
      '[data-section="examples"]',
    );
    const idiomsSection = container.querySelector('[data-section="idioms"]');
    expect(usageSection).toBeInTheDocument();
    expect(
      usageSection?.querySelector('[data-testid="sense-section-header"] svg'),
    ).toBeInTheDocument();
    expect(
      (usageSection as Element).compareDocumentPosition(
        examplesSection as Node,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(idiomsSection).toBeInTheDocument();
    expect(
      idiomsSection?.querySelector('[data-testid="sense-section-header"] svg'),
    ).toBeInTheDocument();
    expect(idiomsSection?.querySelector("div[class*='border-l']")).toHaveClass(
      "border-amber-400",
    );
    expect(
      (examplesSection as Element).compareDocumentPosition(
        idiomsSection as Node,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Vertalen" }));
    expect(
      screen.getByText(model.definitions[0].translation!),
    ).toBeInTheDocument();
    expect(
      screen.getByText(model.examples[0].translation!),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-content-translation="true"]'),
    ).toHaveLength(4);
    expect(
      container.querySelector('[data-content-translation="true"]'),
    ).not.toHaveClass("text-[#dbc47e]");
    expect(
      container.querySelector('[data-testid="entry-translation"]'),
    ).toHaveClass("text-sm", "font-[650]");
    expect(
      container.querySelector('[data-testid="entry-translation"]'),
    ).not.toHaveClass("font-sense-serif", "italic");
    expect(
      container.querySelector('[data-content-translation="true"]'),
    ).toHaveClass("text-[12.5px]", "leading-[1.45]");
    expect(
      container.querySelector('[data-content-translation="true"]'),
    ).not.toHaveClass("font-sense-serif", "italic");

    fireEvent.click(screen.getByRole("button", { name: "Goed" }));
    expect(onAction).toHaveBeenCalledWith(model.reviewCapabilities[2]);
  });

  test("keeps translation off the Face while retaining audio there", () => {
    const baseModel = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });
    const model = {
      ...baseModel,
      requestTranslationCapability: {
        actionId: "request-translation" as const,
        elementId: "sense-card.translation.request",
        messageKey: "senseCard.translation.request",
        target: {
          kind: "entry" as const,
          entryId: "entry-1",
          contentRevision: "revision-1",
        },
        targetLanguageCode: "en",
      },
    };
    render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="en"
        onPlayAudio={vi.fn()}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Play audio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Translate" })).not.toBeInTheDocument();
  });

  test("reveals a requested translation as soon as the refreshed model arrives", () => {
    const translatedModel = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });
    const requestTranslationCapability = {
      actionId: "request-translation" as const,
      elementId: "sense-card.translation.request",
      messageKey: "senseCard.translation.request",
      target: {
        kind: "entry" as const,
        entryId: translatedModel.entryId,
        contentRevision: "revision-1",
      },
      targetLanguageCode: "en",
    };
    const pendingModel = {
      ...translatedModel,
      entryTranslation: undefined,
      definitions: translatedModel.definitions.map((item) => ({
        ...item,
        translation: undefined,
      })),
      examples: translatedModel.examples.map((item) => ({
        ...item,
        translation: undefined,
      })),
      requestTranslationCapability,
    };
    const onAction = vi.fn();
    const { rerender } = render(
      <TrainingSenseCardStage
        model={pendingModel}
        mode="word-to-definition"
        interfaceLanguage="en"
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(onAction).toHaveBeenCalledWith(requestTranslationCapability);

    rerender(
      <TrainingSenseCardStage
        model={{ ...translatedModel, requestTranslationCapability }}
        mode="word-to-definition"
        interfaceLanguage="en"
        onAction={onAction}
      />,
    );
    expect(screen.getByTestId("entry-translation")).toHaveTextContent(
      translatedModel.entryTranslation!,
    );
  });

  test("renders the canonical headword instead of pronunciation metadata", () => {
    const model = buildTrainingSenseCardModel({
      group: {
        ...singleSenseGroup,
        header: {
          ...singleSenseGroup.header,
          text: "record",
          displayPronunciation: "re·ˈcord",
          pronunciation: "[rəkoːr]",
        },
      },
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });

    expect(model.headword).toBe("re·ˈcord");
  });

  test("keeps reverse Face quiet and offers headword audio after reveal", () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });
    const onPlayAudio = vi.fn();

    render(
      <TrainingSenseCardStage
        model={model}
        mode="definition-to-word"
        interfaceLanguage="nl"
        onPlayAudio={onPlayAudio}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByTestId("reverse-prompt")).toHaveTextContent(
      model.definitions[0].text,
    );
    expect(
      screen.queryByText("Welk woord hoort bij deze betekenis?"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Afspelen" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vertalen" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: model.headword }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    expect(
      screen.getByRole("heading", { name: model.headword }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Afspelen" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Afspelen" }));
    expect(onPlayAudio).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Goed" })).toBeInTheDocument();
  });

  test("does not offer a Face translation toggle when only answer content is translated", () => {
    const baseModel = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });
    const { entryTranslation: _entryTranslation, ...model } = baseModel;

    render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="nl"
        onAction={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Vertalen" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    expect(screen.getByRole("button", { name: "Vertalen" })).toBeInTheDocument();
  });

  test("uses the actual definition for reverse mode and routes review hotkeys through V2 capabilities", () => {
    const onAction = vi.fn();
    const baseModel = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });
    const actualDefinition = baseModel.definitions.find(
      (item) => item.kind === "definition",
    )!;
    const model = {
      ...baseModel,
      definitions: [
        {
          contentNodeId: "usage-before-definition",
          parentContentNodeId: null,
          kind: "usage-pattern" as const,
          text: "iemand geeft iemand een hand",
          children: [],
        },
        ...baseModel.definitions,
      ],
    };

    render(
      <TrainingSenseCardStage
        model={model}
        mode="definition-to-word"
        interfaceLanguage="nl"
        onAction={onAction}
      />,
    );

    expect(screen.getByTestId("reverse-prompt")).toHaveTextContent(
      actualDefinition.text,
    );
    fireEvent.keyDown(window, { key: " " });
    expect(
      screen.getByRole("heading", { name: model.headword }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });
    expect(
      screen.queryByRole("heading", { name: model.headword }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });
    expect(
      screen.getByRole("heading", { name: model.headword }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k" });
    expect(onAction).toHaveBeenCalledWith(model.reviewCapabilities[2]);
  });

  test("keeps Space owned by the card when a review button is focused", async () => {
    const onAction = vi.fn();
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });

    render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="nl"
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    const good = screen.getByRole("button", { name: "Goed" });
    good.focus();
    fireEvent.keyDown(good, { key: " " });

    expect(screen.getByTestId("training-sense-card-stage")).toHaveAttribute(
      "data-side",
      "face",
    );
    expect(onAction).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Antwoord tonen" })).toHaveFocus(),
    );
  });

  test("Space reveals the answer instead of activating a focused Hint button", async () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });

    render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="nl"
        onAction={vi.fn()}
      />,
    );

    const hint = screen.getByRole("button", { name: "Hint tonen" });
    hint.focus();
    fireEvent.keyDown(hint, { key: " " });

    expect(document.querySelector("aside")).not.toBeInTheDocument();
    expect(screen.getByTestId("training-sense-card-stage")).toHaveAttribute(
      "data-side",
      "answer",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Opnieuw" })).toHaveFocus(),
    );
  });

  test("keeps modified Space and controls outside the card native", () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });

    render(
      <>
        <button type="button">Outside action</button>
        <TrainingSenseCardStage
          model={model}
          mode="word-to-definition"
          interfaceLanguage="nl"
          onAction={vi.fn()}
        />
      </>,
    );

    const stage = screen.getByTestId("training-sense-card-stage");
    fireEvent.keyDown(stage, { key: " ", shiftKey: true });
    expect(stage).toHaveAttribute("data-side", "face");

    const outside = screen.getByRole("button", { name: "Outside action" });
    outside.focus();
    fireEvent.keyDown(outside, { key: " " });
    expect(stage).toHaveAttribute("data-side", "face");
  });

  test("moves focus to the learn action when a first-encounter answer has no review prompt", async () => {
    const baseModel = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });
    const model = {
      ...baseModel,
      learnCapability: {
        actionId: "start-learning" as const,
        elementId: "sense-card.learn.start",
        messageKey: "senseCard.learning.start",
        target: {
          kind: "sense-card" as const,
          entryId: baseModel.entryId,
          cardTypeId: "word-to-definition" as const,
          stateRevision: "state-new",
        },
      },
      reviewCapabilities: [],
    };

    render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="nl"
        onAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    const learn = screen.getByRole("button", { name: "Leren" });
    expect(learn).toHaveClass("h-11");
    await waitFor(() => expect(learn).toHaveFocus());
  });

  test("adds scroll fades and transfers continuation focus to review at the end", async () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });

    render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="nl"
        onAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    const scroll = screen.getByTestId("training-answer-scroll");
    Object.defineProperty(scroll, "clientHeight", {
      value: 120,
      configurable: true,
    });
    Object.defineProperty(scroll, "scrollHeight", {
      value: 480,
      configurable: true,
    });
    Object.defineProperty(scroll, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(scroll, "scrollBy", {
      value: vi.fn(),
      configurable: true,
    });
    fireEvent.scroll(scroll);

    expect(scroll).toHaveAttribute("data-scroll-top", "clear");
    expect(scroll).toHaveAttribute("data-scroll-bottom", "faded");
    expect(
      screen.getByRole("button", { name: "Meer kaartinhoud tonen" }),
    ).toBeInTheDocument();

    const more = screen.getByRole("button", {
      name: "Meer kaartinhoud tonen",
    });
    more.focus();
    fireEvent.click(more);
    expect(scroll.scrollBy).toHaveBeenCalled();

    scroll.scrollTop = 360;
    fireEvent.scroll(scroll);
    expect(scroll).toHaveAttribute("data-scroll-top", "faded");
    expect(scroll).toHaveAttribute("data-scroll-bottom", "clear");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Opnieuw" })).toHaveFocus(),
    );
  });
});
