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
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });

    render(
      <TrainingSenseCardStage
        model={model}
        interfaceLanguage="nl"
        onPlayAudio={onPlayAudio}
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("heading", { name: "hand" })).toBeInTheDocument();
    expect(screen.queryByText(model.definitions[0].text)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Goed" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Afspelen" }));
    expect(onPlayAudio).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Hint tonen" }));
    expect(screen.getByText(model.examples[0].text)).toBeInTheDocument();
    expect(screen.queryByText(model.definitions[0].text)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    expect(screen.getByText(model.definitions[0].text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Goed" })).toBeInTheDocument();
    expect(
      screen.queryByText("Hoe goed ken je deze betekenis?"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vertalen" }));
    expect(screen.getByText(model.definitions[0].translation!)).toBeInTheDocument();
    expect(screen.getByText(model.examples[0].translation!)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Goed" }));
    expect(onAction).toHaveBeenCalledWith(model.reviewCapabilities[2]);
  });
});
