import React from "react";
import {TrainingInteractionPreferencesProvider,defaultTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
import {TrainingCardAnswerHeader} from "@/components/training/v2/TrainingCardTemplates";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TrainingSenseCardStage as TrainingSenseCardStageView } from "@/components/training/v2/TrainingSenseCardStage";
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

function TrainingSenseCardStage(
  props: Omit<
    React.ComponentProps<typeof TrainingSenseCardStageView>,
    "side" | "onSideChange"
  >,
) {
  const identity = props.model.entryId;
  const [presentation, setPresentation] = React.useState<{
    identity: string;
    side: "face" | "answer";
  }>(() => ({ identity, side: "face" }));
  const side = presentation.identity === identity ? presentation.side : "face";
  return (
    <TrainingSenseCardStageView
      {...props}
      side={side}
      onSideChange={(nextSide) =>
        setPresentation({ identity, side: nextSide })
      }
    />
  );
}

describe("TrainingSenseCardStage", () => {
  test("answer reading is keyboard reachable and Space does not turn it back over", () => {
    const model = buildTrainingSenseCardModel({ group: singleSenseGroup,
      entry: singleSenseEntry, interfaceLanguage: "en" });
    render(<TrainingSenseCardStage model={model} mode="word-to-definition"
      interfaceLanguage="en" onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    const reading = screen.getByTestId("training-answer-scroll");
    expect(reading).toHaveAttribute("role", "region");
    expect(reading).toHaveAttribute("tabindex", "0");
    expect(reading.getAttribute("aria-label")).toBeTruthy();
    reading.focus();
    fireEvent.keyDown(reading, { key: " " });
    expect(screen.getByTestId("training-sense-card-stage")).toHaveAttribute("data-side", "answer");
  });
  test("approved presentation rates through the shared controls and dispatches the owning capability", () => {
    try {
      const model = buildTrainingSenseCardModel({
        group: singleSenseGroup,
        entry: singleSenseEntry,
        interfaceLanguage: "en",
      });
      const onAction = vi.fn();
      render(<TrainingSenseCardStage model={model} mode="word-to-definition"
        interfaceLanguage="en" onAction={onAction} />);
      fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
      expect(screen.getByTestId("training-sense-card-stage"))
        .toHaveAttribute("data-visual-spec", "training-approved-v1");
      const grid = screen.getByTestId("training-review-grid");
      const buttons = Array.from(grid.querySelectorAll("button[data-rating]"));
      expect(buttons.map((button) => button.getAttribute("data-rating"))).toEqual(["Again", "Hard", "Good", "Easy"]);
      expect(buttons.every((button) => !button.className.includes("slate"))).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Hard" }));
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ reviewResult: "hard" }));
      fireEvent.click(screen.getByRole("button", { name: "Again" }));
      expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ reviewResult: "fail" }));
    } finally {
      vi.unstubAllEnvs();
    }
  });
  test("context presentation keeps the normal actions and shows only the latched example", () => {
    const base = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });
    const model = {
      ...base,
      entryTranslation: "слово",
      definitions: base.definitions.map(item => ({ ...item, translation: "Перевод определения." })),
      examples: [
        { contentNodeId: "selected", parentContentNodeId: null, kind: "example" as const,
          text: "Ik ken dit woord.", translation: "Я знаю это слово.", children: [] },
        { contentNodeId: "sibling", parentContentNodeId: null, kind: "example" as const,
          text: "Another sentence.", translation: "Другое предложение.", children: [] },
      ],
    };
    const onHintOpened = vi.fn();
    render(<TrainingSenseCardStage model={model} mode="definition-to-word"
      interfaceLanguage="en" onAction={vi.fn()}
      onHintOpened={onHintOpened}
      contextPrompt={{ text: "Я знаю это слово.", sourceText: "Ik ken dit woord.", contentNodeId: "selected", sourceTextFingerprint: "selected-fingerprint" }} />);
    expect(screen.getByTestId("reverse-prompt")).toHaveTextContent("Я знаю это слово.");
    expect(screen.getByText("Recall the Dutch word for")).toBeInTheDocument();
    expect(screen.getByTestId("training-face-part-of-speech")).toHaveTextContent("noun");
    expect(screen.getByTestId("training-face-recall-target")).toHaveTextContent("слово");
    expect(screen.getByTestId("reverse-prompt").children).toHaveLength(0);
    expect(screen.queryByText(model.headword)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show hint" }));
    expect(screen.getByText("het einde van je arm, waar je vingers aan zitten")).toBeInTheDocument();
    expect(onHintOpened).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByText("het einde van je arm, waar je vingers aan zitten")).toBeInTheDocument();
    expect(screen.getByText("Ik ken dit woord.")).toBeInTheDocument();
    expect(screen.getAllByText("Я знаю это слово.")).toHaveLength(1);
    expect(screen.getByTestId("entry-translation")).toHaveTextContent("слово");
    const headwordTranslation = screen.getByTestId("entry-translation");
    const definitionTranslation = screen.getByText("Перевод определения.");
    const exampleTranslation = screen.getByText("Я знаю это слово.");
    for (const node of [headwordTranslation, definitionTranslation, exampleTranslation]) {
      expect(node.closest('[aria-hidden]')).toHaveAttribute("aria-hidden", "false");
    }
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    for (const node of [headwordTranslation, definitionTranslation, exampleTranslation]) {
      expect(node.closest('[aria-hidden]')).toHaveAttribute("aria-hidden", "true");
    }
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    for (const node of [headwordTranslation, definitionTranslation, exampleTranslation]) {
      expect(node.closest('[aria-hidden]')).toHaveAttribute("aria-hidden", "false");
    }
    expect(screen.queryByText("Another sentence.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Good" })).toBeInTheDocument();
  });

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
    expect(screen.queryByTestId("training-face-part-of-speech")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));

    const nodigIdioms = container.querySelector('[data-section="expressions"]');
    expect(nodigIdioms).toBeInTheDocument();
    expect(nodigIdioms?.querySelector("h3")).toHaveTextContent("Expressions");
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
    expect(expression).toHaveAttribute("data-content-kind", "idiom");
    expect(explanation).toHaveAttribute("data-content-kind", "idiom-explanation");
    expect(example).toHaveAttribute("data-content-kind", "example");
    expect(screen.queryByRole("button", { name: /Report:/ })).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });
  test("keeps the Face audio control in the approved upper-right corner away from long headwords", () => {
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
    expect(corner).toHaveClass("right-[18px]", "top-[18px]");
    expect(corner).not.toHaveClass("left-5", "sm:left-7");
    expect(screen.getByTestId("sense-card-headword-lockup")).not.toContainElement(
      screen.getByRole("button", { name: "Play audio" }),
    );
  });

  test("uses the approved mobile Face and Answer geometry without visible key-hint chrome", () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });

    render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="en"
        onPlayAudio={vi.fn()}
        onOpenDetails={vi.fn()}
        reportAction={<button type="button">Report</button>}
        onAction={vi.fn()}
      />,
    );

    const stage = screen.getByTestId("training-sense-card-stage");
    const shell = screen.getByTestId("training-sense-card-shell");
    const faceDock = screen.getByTestId("training-sense-card-dock");
    const showAnswer = screen.getByRole("button", { name: "Show answer" });

    expect(stage).toHaveAttribute("data-visual-spec", "training-approved-v1");
    expect(shell).toBeInTheDocument();
    expect(faceDock).toContainElement(screen.getByRole("button", { name: "Report" }));
    expect(faceDock).toContainElement(screen.getByRole("button", { name: "Mark as known" }));
    expect(screen.queryByText("Space")).not.toBeInTheDocument();

    fireEvent.click(showAnswer);

    const answerActions = screen.getByTestId("training-answer-header-actions");
    expect(answerActions).toContainElement(screen.getByRole("button", { name: "Play audio" }));
    expect(answerActions).toContainElement(screen.getByRole("button", { name: "Word details" }));
    expect(screen.queryByTestId("training-card-audio-corner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Easy" })).toBeInTheDocument();
  });

  test("uses the product icon library for every visible redesign control", () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });
    const { container } = render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="en"
        onPlayAudio={vi.fn()}
        onOpenDetails={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    expect(container.querySelectorAll("svg:not(.lucide)")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(container.querySelectorAll("svg:not(.lucide)")).toHaveLength(0);
    expect(container.querySelectorAll("svg.lucide").length).toBeGreaterThan(0);
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
    expect(faceShell.className).not.toContain("max-h-[500px]");
    const dock = screen.getByTestId("training-sense-card-dock");
    expect(dock.className).toContain("shrink-0");
    expect(dock.className).toContain("h-[76px]");
    expect(screen.getByRole("button", { name: "Antwoord tonen" })).toBeInTheDocument();
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
    expect(screen.getByRole("region", { name: "Kaartinhoud" })).toContainElement(hint);
    expect(
      screen.queryByText(model.definitions[0].text),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    expect(screen.getByTestId("training-sense-card-shell")).toBe(faceShell);
    expect(screen.getByText(model.definitions[0].text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Goed" })).toBeInTheDocument();
    expect(screen.getByText("2K")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Melden" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Hoe goed ken je deze betekenis?"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Hoe goed ken je deze betekenis?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Goed" })).toBeInTheDocument();
    expect(screen.queryByText("Betekenis")).not.toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="examples"] h3 svg',
      ),
    ).toBeInTheDocument();
    const usageSection = container.querySelector('[data-section="usage"]');
    const examplesSection = container.querySelector(
      '[data-section="examples"]',
    );
    const idiomsSection = container.querySelector('[data-section="expressions"]');
    expect(usageSection).toBeInTheDocument();
    expect(
      usageSection?.querySelector('h3 svg'),
    ).toBeInTheDocument();
    expect(
      (examplesSection as Element).compareDocumentPosition(
        usageSection as Node,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(idiomsSection).toBeInTheDocument();
    expect(
      idiomsSection?.querySelector('h3 svg'),
    ).toBeInTheDocument();
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
    const stage = screen.getByTestId("training-sense-card-stage");
    stage.focus();
    fireEvent.keyDown(stage, { key: " " });
    expect(
      screen.getByRole("heading", { name: model.headword }),
    ).toBeInTheDocument();
    fireEvent.keyDown(stage, { key: " " });
    expect(
      screen.queryByRole("heading", { name: model.headword }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(stage, { key: " " });
    expect(
      screen.getByRole("heading", { name: model.headword }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k" });
    expect(onAction).toHaveBeenCalledWith(model.reviewCapabilities[2]);
  });

  test("leaves Space native for every interactive card action", () => {
    const onAction = vi.fn();
    const onReport = vi.fn();
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "en",
    });

    render(
      <TrainingSenseCardStage
        model={model}
        mode="word-to-definition"
        interfaceLanguage="en"
        onPlayAudio={vi.fn()}
        onOpenDetails={vi.fn()}
        reportAction={
          <button type="button" onClick={onReport}>
            Report
          </button>
        }
        onAction={onAction}
      />,
    );

    const stage = screen.getByTestId("training-sense-card-stage");
    for (const name of [
      "Play audio",
      "Show hint",
      "Show answer",
      "Report",
      "Mark as known",
    ]) {
      const control = screen.getByRole("button", { name });
      control.focus();
      expect(fireEvent.keyDown(control, { key: " " })).toBe(true);
      expect(stage).toHaveAttribute("data-side", "face");
    }

    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    for (const name of [
      "Play audio",
      "Word details",
      "Report",
      "Mark as known",
      "Good",
    ]) {
      const control = screen.getByRole("button", { name });
      control.focus();
      expect(fireEvent.keyDown(control, { key: " " })).toBe(true);
      expect(stage).toHaveAttribute("data-side", "answer");
    }
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

test("approved answer keeps the unavailable translation button visible without dispatching",()=>{
 try {
 const toggle=vi.fn();render(<TrainingCardAnswerHeader model={{headword:"aandoen",repeatCount:0,definitions:[],examples:[]}} translationVisible={false} translationAvailable={false} translationLabel="Translation is off. Choose a translation language in Settings." audioLabel="Play" moreLabel="More" busy={false} onToggleTranslation={toggle}/>);
 const button=screen.getByRole("button",{name:"Translation is off. Choose a translation language in Settings."});
 expect(button).toBeDisabled();fireEvent.click(button);expect(toggle).not.toHaveBeenCalled();
 } finally {vi.unstubAllEnvs();}
});

test("direct and reverse sides share the account syllable display",async()=>{
 const model=buildTrainingSenseCardModel({group:{...singleSenseGroup,header:{...singleSenseGroup.header,text:"maken",displayPronunciation:"má·ken"}},entry:singleSenseEntry,interfaceLanguage:"en"});
 const repository={load:vi.fn(),save:vi.fn().mockResolvedValue(undefined)};
 const initial={...defaultTrainingInteractions,animation:false,syllableDoubleTap:true};
 const view=(mode:"word-to-definition"|"definition-to-word")=><TrainingInteractionPreferencesProvider userId="owner" initial={initial} repository={repository}><TrainingSenseCardStage key={mode} model={model} mode={mode} interfaceLanguage="en" onAction={vi.fn()}/></TrainingInteractionPreferencesProvider>;
 const {rerender}=render(view("word-to-definition"));
 expect(screen.getByRole('button',{name:'maken'})).toHaveTextContent('maken');
 fireEvent.doubleClick(screen.getByRole('button',{name:'maken'}));
 fireEvent.click(screen.getByRole('button',{name:'Show answer'}));
 expect(screen.getByRole('button',{name:'maken'})).toHaveTextContent('má·ken');
 await waitFor(()=>expect(repository.save).toHaveBeenCalledOnce());
 rerender(view("definition-to-word"));fireEvent.click(screen.getByRole('button',{name:'Show answer'}));
 expect(screen.getByRole('button',{name:'maken'})).toHaveTextContent('má·ken');
 fireEvent.doubleClick(screen.getByRole('button',{name:'maken'}));
 expect(screen.getByRole('button',{name:'maken'})).toHaveTextContent('maken');
 await waitFor(()=>expect(repository.save).toHaveBeenCalledTimes(2));
});

test('upward audio gesture uses the word player on Face and Answer',()=>{
 const onPlayAudio=vi.fn();
 const model=buildTrainingSenseCardModel({group:singleSenseGroup,entry:singleSenseEntry,interfaceLanguage:'en'});
 render(<TrainingInteractionPreferencesProvider userId="owner" initial={{...defaultTrainingInteractions,audioSwipe:true}}><TrainingSenseCardStage model={model} mode="word-to-definition" interfaceLanguage="en" onAction={vi.fn()} onPlayAudio={onPlayAudio}/></TrainingInteractionPreferencesProvider>);
 const swipe=()=>{const shell=screen.getByTestId('training-sense-card-shell');fireEvent.touchStart(shell,{touches:[{clientX:100,clientY:200}]});fireEvent.touchMove(shell,{touches:[{clientX:100,clientY:140}]});fireEvent.touchEnd(shell,{touches:[],changedTouches:[{clientX:100,clientY:140}]});};
 swipe();expect(onPlayAudio).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Show answer'}));swipe();expect(onPlayAudio).toHaveBeenCalledTimes(2);
});
