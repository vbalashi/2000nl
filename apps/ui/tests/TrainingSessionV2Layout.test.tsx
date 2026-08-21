import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  resolveTrainingSessionLayoutPhase,
  TrainingSessionV2Layout,
} from "@/components/training/v2/TrainingSessionV2Layout";

const knownFailures = [
  "lookup-http-error",
  "contract-mismatch",
  "entry-not-found",
  "model-invalid",
  "reverse-definition-missing",
] as const;

describe("TrainingSessionV2Layout", () => {
  test.each(["loading", "ready"] as const)(
    "keeps session chrome and footer in the %s phase",
    (phase) => {
      render(
        <TrainingSessionV2Layout
          phase={phase}
          chrome={<div data-testid="chrome" />}
          footer={<div data-testid="footer" />}
        >
          <div data-testid="card" />
        </TrainingSessionV2Layout>,
      );

      expect(screen.getByTestId("chrome")).toBeInTheDocument();
      expect(screen.getByTestId("footer")).toBeInTheDocument();
      expect(screen.getByTestId("card")).toBeInTheDocument();
    },
  );

  test.each(knownFailures)(
    "maps the known %s state to an error-only first render",
    (state) => {
      expect(resolveTrainingSessionLayoutPhase(state)).toBe("failure");
      render(
        <TrainingSessionV2Layout
          phase={resolveTrainingSessionLayoutPhase(state)}
          chrome={<div data-testid="chrome" />}
          footer={<div data-testid="footer" />}
        >
          <div data-testid="failure" />
        </TrainingSessionV2Layout>,
      );

      expect(screen.queryByTestId("chrome")).not.toBeInTheDocument();
      expect(screen.queryByTestId("footer")).not.toBeInTheDocument();
      expect(screen.getByTestId("failure")).toBeInTheDocument();
    },
  );

  test("fails closed for an unknown future renderer state", () => {
    expect(resolveTrainingSessionLayoutPhase("future-nonfailure-state")).toBe(
      "failure",
    );
  });
});
