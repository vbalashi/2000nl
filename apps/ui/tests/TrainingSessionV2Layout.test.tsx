import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
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

  test("owns the ready-card interaction surface without leaking it into loading or failure", () => {
    const onTouchStart = vi.fn();
    const onTouchMove = vi.fn();
    const onTouchEnd = vi.fn();
    const onTouchCancel = vi.fn();
    const readySurface = {
      className:
        "transition-transform duration-200 ease-out motion-reduce:transition-none",
      style: { transform: "translateX(42px) rotate(1deg)" },
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
      feedback: <div data-testid="swipe-feedback" />,
    };
    const { rerender } = render(
      <TrainingSessionV2Layout
        phase="ready"
        chrome={<div />}
        footer={<div />}
        readySurface={readySurface}
      >
        <div />
      </TrainingSessionV2Layout>,
    );

    const readyWrapper = screen.getByTestId("training-card-swipe-wrapper");
    expect(readyWrapper).toHaveStyle({
      transform: "translateX(42px) rotate(1deg)",
    });
    expect(readyWrapper).toHaveClass("motion-reduce:transition-none");
    expect(screen.getByTestId("swipe-feedback")).toBeInTheDocument();
    fireEvent.touchStart(readyWrapper);
    fireEvent.touchMove(readyWrapper);
    fireEvent.touchEnd(readyWrapper);
    fireEvent.touchCancel(readyWrapper);
    expect(onTouchStart).toHaveBeenCalledOnce();
    expect(onTouchMove).toHaveBeenCalledOnce();
    expect(onTouchEnd).toHaveBeenCalledOnce();
    expect(onTouchCancel).toHaveBeenCalledOnce();

    for (const phase of ["loading", "failure"] as const) {
      rerender(
        <TrainingSessionV2Layout
          phase={phase}
          chrome={<div />}
          footer={<div />}
          readySurface={readySurface}
        >
          <div />
        </TrainingSessionV2Layout>,
      );
      const inactiveWrapper = screen.getByTestId(
        "training-card-swipe-wrapper",
      );
      expect(inactiveWrapper).not.toHaveStyle({
        transform: "translateX(42px) rotate(1deg)",
      });
      expect(inactiveWrapper).not.toHaveClass("motion-reduce:transition-none");
      expect(screen.queryByTestId("swipe-feedback")).not.toBeInTheDocument();
    }
  });
});
