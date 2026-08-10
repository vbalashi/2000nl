import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import {
  singleSenseEntry,
  singleSenseGroup,
} from "./platformV2TrainingFixture";

describe("TrainingSenseCardStage", () => {
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
          kind: "usage-pattern" as const,
          text: "iemand de hand geven",
          translation: "to shake someone's hand",
        },
      ],
      examples: [
        ...baseModel.examples,
        {
          contentNodeId: "idiom-1",
          kind: "idiom" as const,
          text: "door de bank genomen",
          translation: "on average",
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
    const faceShell = screen.getByTestId("training-sense-card-shell");
    expect(faceShell.className).toContain("flex-1");
    expect(faceShell.className).toContain("max-h-[500px]");
    const dock = screen.getByTestId("training-sense-card-dock");
    expect(dock.className).toContain("shrink-0");
    expect(dock.className).toContain("sm:h-20");
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
    expect(
      screen.queryByRole("button", { name: "Melden" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Hoe goed ken je deze betekenis?"),
    ).not.toBeInTheDocument();
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
      ) &
        Node.DOCUMENT_POSITION_FOLLOWING,
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

    fireEvent.click(screen.getByRole("button", { name: "Goed" }));
    expect(onAction).toHaveBeenCalledWith(model.reviewCapabilities[2]);
  });

  test("keeps the headword hidden on a reverse Face and reveals the same exact sense on Answer", () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });

    render(
      <TrainingSenseCardStage
        model={model}
        mode="definition-to-word"
        interfaceLanguage="nl"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByTestId("reverse-prompt")).toHaveTextContent(
      model.definitions[0].text,
    );
    expect(
      screen.queryByRole("heading", { name: model.headword }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    expect(
      screen.getByRole("heading", { name: model.headword }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Goed" })).toBeInTheDocument();
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
          kind: "usage-pattern" as const,
          text: "iemand geeft iemand een hand",
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
});
