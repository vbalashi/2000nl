import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  TrainingKnownUndoNotice,
  TrainingSenseCardV2Session,
} from "@/components/training/v2/TrainingSenseCardV2Session";
import type { TrainingWord } from "@/lib/types";
import {
  projectedTrainingAudioResult,
  singleSenseEntry,
  singleSenseGroup,
} from "./platformV2TrainingFixture";

const fetchSingleSense = vi.fn();
const performAction = vi.fn();
const resolveAudio = vi.fn();
const requestTranslation = vi.fn();
const peekPrefetched = vi.fn();
const consumePrefetched = vi.fn();
const preloadAudio = vi.fn();
const queueDiagnosticReport = vi.fn();
const buildDiagnosticReport = vi.fn();

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  fetchPlatformV2TrainingEntry: (...args: unknown[]) => fetchSingleSense(...args),
  peekPrefetchedPlatformV2TrainingEntry: (...args: unknown[]) => peekPrefetched(...args),
  consumePrefetchedPlatformV2TrainingEntry: (...args: unknown[]) => consumePrefetched(...args),
  resolvePlatformV2Audio: (...args: unknown[]) => resolveAudio(...args),
  preloadPlatformV2Audio: (...args: unknown[]) => preloadAudio(...args),
  requestPlatformV2Translation: (...args: unknown[]) => requestTranslation(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingActionClient", () => ({
  isPlatformV2TrainingActionCapability: (capability: { actionId: string }) =>
    ["start-learning", "mark-known", "undo-known", "review-card"].includes(
      capability.actionId,
    ),
  performPlatformV2TrainingAction: (...args: unknown[]) =>
    performAction(...args),
}));

vi.mock("@/lib/feedback/diagnosticReportClient", () => ({
  freezeSenseCardDiagnosticSnapshot: (input: unknown) => input,
  buildSenseCardDiagnosticReport: (...args: unknown[]) =>
    buildDiagnosticReport(...args),
  queuePreparedSenseCardDiagnosticReport: (...args: unknown[]) =>
    queueDiagnosticReport(...args),
}));

function TestTrainingSenseCardV2Session(
  props: Omit<
    React.ComponentProps<typeof TrainingSenseCardV2Session>,
    "cacheOwnerId" | "presentationIdentity"
  > & { presentationIdentity?: string },
) {
  return (
    <TrainingSenseCardV2Session
      cacheOwnerId="test-user"
      presentationIdentity={
        props.presentationIdentity ??
        `test-presentation:${props.word.id}:${props.mode}`
      }
      {...props}
    />
  );
}

function testPresentationIdentity(
  nextWord: TrainingWord,
  mode: "word-to-definition" | "definition-to-word",
) {
  return `test-presentation:${nextWord.id}:${mode}`;
}

const word: TrainingWord = {
  id: singleSenseEntry.entryId,
  headword: "hand",
  raw: {},
  isFirstEncounter: false,
  mode: "word-to-definition",
};

describe("TrainingSenseCardV2Session", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    fetchSingleSense.mockReset();
    performAction.mockReset();
    resolveAudio.mockReset();
    requestTranslation.mockReset();
    peekPrefetched.mockReset();
    consumePrefetched.mockReset();
    preloadAudio.mockReset();
    queueDiagnosticReport.mockReset();
    buildDiagnosticReport.mockReset();
    peekPrefetched.mockReturnValue(null);
    consumePrefetched.mockReturnValue(null);
    requestTranslation.mockResolvedValue(undefined);
    preloadAudio.mockResolvedValue(undefined);
    resolveAudio.mockResolvedValue("/audio/hand.mp3");
    queueDiagnosticReport.mockResolvedValue({ state: "sent" });
    buildDiagnosticReport.mockImplementation(async (input) => ({
      ...(input as object),
      reportId: "55555555-5555-4555-8555-555555555555",
    }));
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: singleSenseEntry,
    });
    performAction.mockResolvedValue({
      contractVersion: "platform-action-v2",
      actionId: "review-card",
      clientEventId: "event-1",
      accepted: true,
      card: singleSenseEntry.card,
    });
  });

  test("offers one global report action on face and answer and sends without advancing", async () => {
    const reportCapability = {
      actionId: "report-content" as const,
      elementId: "sense-card.report",
      messageKey: "senseCard.report",
      target: {
        kind: "entry" as const,
        entryId: "11111111-1111-4111-8111-111111111111",
        contentRevision: "a".repeat(64),
      },
    };
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: {
        ...singleSenseEntry,
        entryId: reportCapability.target.entryId,
        reportContentRevision: reportCapability.target.contentRevision,
        capabilities: [...singleSenseEntry.capabilities, reportCapability],
      },
    });
    const onProgressActionAccepted = vi.fn();

    render(
      <TestTrainingSenseCardV2Session
        word={{ ...word, id: reportCapability.target.entryId }}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={onProgressActionAccepted}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    expect(screen.getAllByRole("button", { name: "Melden" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Melden:/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Melden" }));
    expect(await screen.findByRole("dialog", { name: "Wat klopt er niet?" })).toBeInTheDocument();
    expect(document.querySelector("#sense-card-report-context")).toHaveTextContent(
      "Kaartcontext en sessiegegevens worden automatisch meegestuurd.",
    );
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    const stage = screen.getByTestId("training-sense-card-stage");
    for (const control of [
      screen.getByRole("button", { name: "Terug" }),
      screen.getByRole("button", { name: "Versturen" }),
      screen.getByRole("radio", { name: "Vertaling" }),
      screen.getByPlaceholderText("Optionele opmerking (niet verplicht)"),
    ]) {
      fireEvent.keyDown(control, { key: " " });
      expect(stage).toHaveAttribute("data-side", "face");
    }
    fireEvent.click(screen.getByRole("radio", { name: "Vertaling" }));
    fireEvent.click(screen.getByRole("button", { name: "Versturen" }));
    await screen.findByText("Verzonden");
    expect(queueDiagnosticReport).toHaveBeenCalledOnce();
    expect(onProgressActionAccepted).not.toHaveBeenCalled();
    expect(performAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Sluiten" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    expect(screen.getAllByRole("button", { name: "Melden" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Melden:/ })).not.toBeInTheDocument();
  });

  test("retries the exact same frozen report identity and payload", async () => {
    const reportCapability = {
      actionId: "report-content" as const,
      elementId: "sense-card.report",
      messageKey: "senseCard.report",
      target: {
        kind: "entry" as const,
        entryId: "11111111-1111-4111-8111-111111111111",
        contentRevision: "a".repeat(64),
      },
    };
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: {
        ...singleSenseEntry,
        entryId: reportCapability.target.entryId,
        reportContentRevision: reportCapability.target.contentRevision,
        capabilities: [...singleSenseEntry.capabilities, reportCapability],
      },
    });
    queueDiagnosticReport
      .mockRejectedValueOnce(new Error("diagnostic_outbox_failed"))
      .mockResolvedValueOnce({ state: "sent" });

    render(
      <TestTrainingSenseCardV2Session
        word={{ ...word, id: reportCapability.target.entryId }}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Melden" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Iets anders" }));
    fireEvent.change(screen.getByPlaceholderText("Optionele opmerking (niet verplicht)"), {
      target: { value: "zelfde melding" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Versturen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Probeer opnieuw");
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
    await screen.findByText("Verzonden");

    expect(buildDiagnosticReport).toHaveBeenCalledOnce();
    expect(queueDiagnosticReport).toHaveBeenCalledTimes(2);
    expect(queueDiagnosticReport.mock.calls[1][0]).toBe(
      queueDiagnosticReport.mock.calls[0][0],
    );
    expect(queueDiagnosticReport.mock.calls[1][0]).toMatchObject({
      reportId: "55555555-5555-4555-8555-555555555555",
      kind: "other",
      comment: "zelfde melding",
    });
  });

  test("announces sending and terminal delivery on one stable live region", async () => {
    const reportCapability = {
      actionId: "report-content" as const,
      elementId: "sense-card.report",
      messageKey: "senseCard.report",
      target: {
        kind: "entry" as const,
        entryId: "11111111-1111-4111-8111-111111111111",
        contentRevision: "a".repeat(64),
      },
    };
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: {
        ...singleSenseEntry,
        entryId: reportCapability.target.entryId,
        reportContentRevision: reportCapability.target.contentRevision,
        capabilities: [...singleSenseEntry.capabilities, reportCapability],
      },
    });
    let resolveDelivery!: (value: { state: "sent" }) => void;
    queueDiagnosticReport.mockImplementationOnce(
      () => new Promise((resolve) => { resolveDelivery = resolve; }),
    );

    render(
      <TestTrainingSenseCardV2Session
        word={{ ...word, id: reportCapability.target.entryId }}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Melden" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Iets anders" }));
    const dialog = screen.getByRole("dialog", { name: "Wat klopt er niet?" });
    const announcement = screen.getByTestId("report-delivery-announcement");
    fireEvent.click(screen.getByRole("button", { name: "Versturen" }));
    await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "true"));
    expect(announcement).toHaveTextContent("Versturen");
    await act(async () => resolveDelivery({ state: "sent" }));
    await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByTestId("report-delivery-announcement")).toBe(announcement);
    expect(announcement).toHaveTextContent("Verzonden");
    expect(screen.getByRole("button", { name: "Sluiten" })).toHaveFocus();
    expect(dialog).toHaveAttribute("aria-describedby", "sense-card-report-delivery-description");
  });

  test("uses the exact server capability, then asks the session owner to advance", async () => {
    const onProgressActionAccepted = vi.fn();
    const onProgressActionStarting = vi.fn();

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionStarting={onProgressActionStarting}
        onProgressActionAccepted={onProgressActionAccepted}
      />,
    );

    expect(screen.getByTestId("training-v2-loading")).toHaveAttribute(
      "data-training-v2-state",
      "loading",
    );
    expect(screen.queryByText("Legacy card")).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: "hand" });
    expect(screen.getByTestId("training-sense-card-v2")).toHaveAttribute(
      "data-training-v2-state",
      "ready",
    );

    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Goed" }));

    const capability = singleSenseEntry.capabilities.find(
      (candidate) =>
        candidate.actionId === "review-card" &&
        candidate.reviewResult === "success",
    );
    await waitFor(() =>
      expect(performAction).toHaveBeenCalledWith(
        capability,
        expect.objectContaining({ onRequestFrozen: expect.any(Function) }),
      ),
    );
    expect(onProgressActionStarting).toHaveBeenCalledOnce();
    expect(onProgressActionStarting.mock.invocationCallOrder[0]).toBeLessThan(
      performAction.mock.invocationCallOrder[0]!,
    );
    expect(onProgressActionAccepted).toHaveBeenCalledWith(capability);
  });

  test("offers the server-provided Mark Known capability on the card face", async () => {
    const onProgressActionAccepted = vi.fn();
    const markKnown = singleSenseEntry.capabilities.find(
      (candidate) => candidate.actionId === "mark-known",
    )!;
    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={onProgressActionAccepted}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    expect(screen.getByTestId("training-sense-card-stage")).toHaveAttribute(
      "data-side",
      "face",
    );
    const markKnownButton = screen.getByRole("button", {
      name: "Markeer als bekend",
    });
    fireEvent.keyDown(markKnownButton, { key: " " });
    expect(screen.getByTestId("training-sense-card-stage")).toHaveAttribute(
      "data-side",
      "face",
    );
    fireEvent.click(markKnownButton);
    await waitFor(() =>
      expect(performAction).toHaveBeenCalledWith(
        markKnown,
        expect.objectContaining({ onRequestFrozen: expect.any(Function) }),
      ),
    );
    expect(onProgressActionAccepted).toHaveBeenCalledWith(markKnown);
  });

  test("does not invent Mark Known on the face when the server omits the capability", async () => {
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: {
        ...singleSenseEntry,
        capabilities: singleSenseEntry.capabilities.filter(
          (candidate) => candidate.actionId !== "mark-known",
        ),
      },
    });

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    expect(
      screen.queryByRole("button", { name: "Markeer als bekend" }),
    ).not.toBeInTheDocument();
  });

  test("freezes the exact failed training operation for a later global report", async () => {
    const reportCapability = {
      actionId: "report-content" as const,
      elementId: "sense-card.report",
      messageKey: "senseCard.report",
      target: {
        kind: "entry" as const,
        entryId: "11111111-1111-4111-8111-111111111111",
        contentRevision: "a".repeat(64),
      },
    };
    const entry = {
      ...singleSenseEntry,
      entryId: reportCapability.target.entryId,
      reportContentRevision: reportCapability.target.contentRevision,
      capabilities: [...singleSenseEntry.capabilities, reportCapability],
    };
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry,
    });
    performAction.mockImplementationOnce(
      (capability: typeof singleSenseEntry.capabilities[number], context: {
        onRequestFrozen?: (request: unknown) => void;
      }) => {
        context.onRequestFrozen?.({
          actionId: capability.actionId,
          clientEventId: "33333333-3333-4333-8333-333333333333",
          target: capability.target,
          ...("reviewResult" in capability
            ? { reviewResult: capability.reviewResult }
            : {}),
        });
        return Promise.reject(new Error("platform_request_timeout"));
      },
    );

    render(
      <TestTrainingSenseCardV2Session
        word={{ ...word, id: entry.entryId }}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Goed" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Melden" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Trainingsactie" }));
    fireEvent.click(screen.getByRole("button", { name: "Versturen" }));

    await waitFor(() => expect(queueDiagnosticReport).toHaveBeenCalledOnce());
    expect(queueDiagnosticReport.mock.calls[0][0]).toMatchObject({
      kind: "training-action",
      snapshot: {
        operation: {
          request: {
            actionId: "review-card",
            clientEventId: "33333333-3333-4333-8333-333333333333",
            reviewResult: "success",
          },
          observedOutcome: "timeout",
        },
      },
    });
  });

  test("keeps a failed action attached across state-conflict refresh of the same turn", async () => {
    const reportCapability = {
      actionId: "report-content" as const,
      elementId: "sense-card.report",
      messageKey: "senseCard.report",
      target: {
        kind: "entry" as const,
        entryId: "11111111-1111-4111-8111-111111111111",
        contentRevision: "a".repeat(64),
      },
    };
    const entry = {
      ...singleSenseEntry,
      entryId: reportCapability.target.entryId,
      reportContentRevision: reportCapability.target.contentRevision,
      capabilities: [...singleSenseEntry.capabilities, reportCapability],
    };
    fetchSingleSense
      .mockResolvedValueOnce({ state: "ready", group: singleSenseGroup, entry })
      .mockResolvedValueOnce({
        state: "ready",
        group: singleSenseGroup,
        entry: {
          ...entry,
          card: {
            ...entry.card!,
            stateRevision: "44444444-4444-4444-8444-444444444444",
          },
        },
      });
    performAction.mockImplementationOnce(
      (capability: typeof singleSenseEntry.capabilities[number], context: {
        onRequestFrozen?: (request: unknown) => void;
      }) => {
        context.onRequestFrozen?.({
          actionId: capability.actionId,
          clientEventId: "33333333-3333-4333-8333-333333333333",
          target: capability.target,
          ...("reviewResult" in capability
            ? { reviewResult: capability.reviewResult }
            : {}),
        });
        return Promise.reject(new Error("state_conflict"));
      },
    );

    render(
      <TestTrainingSenseCardV2Session
        word={{ ...word, id: entry.entryId }}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Goed" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Melden" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Trainingsactie" }));
    fireEvent.click(screen.getByRole("button", { name: "Versturen" }));

    await waitFor(() => expect(queueDiagnosticReport).toHaveBeenCalledOnce());
    expect(queueDiagnosticReport.mock.calls[0][0]).toMatchObject({
      snapshot: {
        operation: {
          observedOutcome: "state-conflict",
          request: {
            clientEventId: "33333333-3333-4333-8333-333333333333",
          },
        },
      },
    });
  });

  test("shows an explicit V2 error instead of the legacy card when lookup returns HTTP 500", async () => {
    fetchSingleSense.mockResolvedValue({
      state: "lookup-http-error",
      status: 500,
    });

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    const errorState = await screen.findByRole("alert");
    expect(errorState).toHaveAttribute("data-training-renderer", "v2");
    expect(errorState).toHaveAttribute(
      "data-training-v2-state",
      "lookup-http-error",
    );
    expect(screen.queryByText("Legacy card")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opnieuw proberen" })).toBeInTheDocument();
  });

  test.each(["contract-mismatch", "entry-not-found"] as const)(
    "shows retryable V2 state %s without legacy content",
    async (state) => {
      fetchSingleSense.mockResolvedValue({ state });
      render(
        <TestTrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
          onProgressActionAccepted={vi.fn()}
        />,
      );

      expect(await screen.findByRole("alert")).toHaveAttribute(
        "data-training-v2-state",
        state,
      );
      expect(screen.queryByText("Legacy card")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    },
  );

  test("retries a failed V2 lookup", async () => {
    fetchSingleSense
      .mockResolvedValueOnce({ state: "entry-not-found" })
      .mockResolvedValueOnce({
        state: "ready",
        group: singleSenseGroup,
        entry: singleSenseEntry,
      });
    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "hand" })).toBeInTheDocument();
    expect(fetchSingleSense).toHaveBeenCalledTimes(2);
  });

  test("classifies a structurally invalid card and asks the session owner for a fresh candidate", async () => {
    const onLoadFailure = vi.fn();
    const onRetryAlternative = vi.fn();
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: { ...singleSenseEntry, contentNodes: [] },
    });
    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="definition-to-word"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
        onLoadFailure={onLoadFailure}
        onRetryAlternative={onRetryAlternative}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveAttribute(
      "data-training-v2-state",
      "reverse-definition-missing",
    );
    expect(onLoadFailure).toHaveBeenCalledWith("reverse-definition-missing");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryAlternative).toHaveBeenCalledWith(
      "reverse-definition-missing",
    );
    expect(fetchSingleSense).toHaveBeenCalledTimes(1);
  });

  test("keeps a rejected retry recoverable instead of getting stuck loading", async () => {
    fetchSingleSense
      .mockResolvedValueOnce({ state: "entry-not-found" })
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("alert")).toHaveAttribute(
      "data-training-v2-state",
      "lookup-http-error",
    );
    expect(screen.queryByTestId("training-v2-loading")).not.toBeInTheDocument();
  });

  test("opens the durable report sheet from the existing global action", async () => {
    const reportCapability = {
      actionId: "report-content" as const,
      elementId: "sense-card.report",
      messageKey: "senseCard.report",
      target: {
        kind: "entry" as const,
        entryId: singleSenseEntry.entryId,
        contentRevision: singleSenseEntry.contentRevision,
      },
    };
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: {
        ...singleSenseEntry,
        reportContentRevision: "a".repeat(64),
        capabilities: [...singleSenseEntry.capabilities, reportCapability],
      },
    });

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Melden" }));
    expect(await screen.findByRole("dialog", { name: "Wat klopt er niet?" })).toBeInTheDocument();
    expect(performAction).not.toHaveBeenCalled();
  });

  test("announces and focuses the replacement card after the queue advances", async () => {
    const nextEntry = {
      ...singleSenseEntry,
      entryId: "entry-bank-1",
      contentRevision: "content-bank-1",
    };
    const nextGroup = {
      ...singleSenseGroup,
      headwordGroupId: "group-bank",
      header: {
        ...singleSenseGroup.header,
        text: "bank",
        displayPronunciation: "bank",
      },
      entries: [nextEntry],
    };
    fetchSingleSense
      .mockResolvedValueOnce({ state: "ready", group: singleSenseGroup, entry: singleSenseEntry })
      .mockResolvedValueOnce({ state: "ready", group: nextGroup, entry: nextEntry });
    const view = render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    const liveRegion = view.container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    view.rerender(
      <TestTrainingSenseCardV2Session
        word={{ ...word, id: nextEntry.entryId, headword: "bank" }}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        focusOnPresentation
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "bank" });
    expect(view.container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Volgende trainingskaart",
    );
    expect(screen.getByText("Volgende trainingskaart")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("training-sense-card-stage")).toHaveFocus(),
    );

    const settingsControl = document.createElement("button");
    settingsControl.textContent = "Settings control";
    document.body.append(settingsControl);
    settingsControl.focus();
    fetchSingleSense.mockResolvedValueOnce({
      state: "lookup-http-error",
      status: 503,
    });
    view.rerender(
      <TestTrainingSenseCardV2Session
        word={{ ...word, id: nextEntry.entryId, headword: "bank" }}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="ru"
        interfaceLanguage="en"
        focusOnPresentation
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await waitFor(() => expect(fetchSingleSense).toHaveBeenCalledTimes(3));
    await screen.findByRole("alert");
    expect(view.container.querySelector('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent("Volgende trainingskaart");
    expect(settingsControl).toHaveFocus();

    fetchSingleSense.mockResolvedValueOnce({
      state: "ready",
      group: nextGroup,
      entry: nextEntry,
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(fetchSingleSense).toHaveBeenCalledTimes(4));
    await screen.findByRole("heading", { name: "bank" });
    expect(view.container.querySelector('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent("Volgende trainingskaart");
    expect(settingsControl).toHaveFocus();
    settingsControl.remove();
  });

  test("keeps undo available across a same-card remount", async () => {
    const onProgressActionAccepted = vi.fn();
    const markKnown = singleSenseEntry.capabilities.find(
      (candidate) => candidate.actionId === "mark-known",
    )!;
    const undoKnown = {
      actionId: "undo-known" as const,
      elementId: "sense-card.known.undo",
      messageKey: "senseCard.known.undo",
      target: {
        ...markKnown.target,
        stateRevision: "0d0a9b93-7b67-49ca-a12c-47821c68ce8d",
        activeKnownMarkId: "20b34a88-b29d-4a72-89e5-49221af7ca27",
        knownMarkRevision: "ef774f0a-59a4-420a-b2e2-85a544050892",
      },
    };
    const knownEntry = {
      ...singleSenseEntry,
      card: {
        cardTypeId: "word-to-definition" as const,
        scheduler: { phase: "hidden" as const, repeatCount: 3 },
        knownMark: {
          markId: undoKnown.target.activeKnownMarkId,
          revision: undoKnown.target.knownMarkRevision,
          markedAt: "2026-08-05T10:00:00.000Z",
        },
        stateRevision: undoKnown.target.stateRevision,
      },
      capabilities: [undoKnown],
    };
    fetchSingleSense
      .mockResolvedValueOnce({ state: "ready", group: singleSenseGroup, entry: singleSenseEntry })
      .mockResolvedValueOnce({ state: "ready", group: singleSenseGroup, entry: knownEntry });
    performAction
      .mockResolvedValueOnce({
        contractVersion: "platform-action-v2",
        actionId: "mark-known",
        clientEventId: "event-known",
        accepted: true,
        card: {
          cardTypeId: "word-to-definition",
          scheduler: { phase: "hidden", repeatCount: 3 },
          knownMark: {
            markId: "20b34a88-b29d-4a72-89e5-49221af7ca27",
            revision: "ef774f0a-59a4-420a-b2e2-85a544050892",
            markedAt: "2026-08-05T10:00:00.000Z",
          },
          stateRevision: "0d0a9b93-7b67-49ca-a12c-47821c68ce8d",
        },
      })
      .mockResolvedValueOnce({
        contractVersion: "platform-action-v2",
        actionId: "undo-known",
        clientEventId: "event-undo",
        accepted: true,
        card: {
          ...singleSenseEntry.card!,
          stateRevision: "d1459359-7bed-40e0-a360-243b8329aad0",
        },
      });

    const firstRender = render(
      <>
        <TestTrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          onProgressActionAccepted={onProgressActionAccepted}
        />
        <TrainingKnownUndoNotice
          interfaceLanguage="nl"
          currentPresentationIdentity={testPresentationIdentity(
            word,
            "word-to-definition",
          )}
        />
      </>,
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Markeer als bekend" }));

    await waitFor(() => expect(onProgressActionAccepted).toHaveBeenCalled());
    firstRender.unmount();
    render(
      <>
        <TestTrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          onProgressActionAccepted={onProgressActionAccepted}
        />
        <TrainingKnownUndoNotice
          interfaceLanguage="nl"
          currentPresentationIdentity={testPresentationIdentity(
            word,
            "word-to-definition",
          )}
        />
      </>,
    );

    expect(
      await screen.findByRole("button", { name: "Markering ongedaan maken" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Melding sluiten" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Markering ongedaan maken" }),
    );

    await waitFor(() => expect(performAction).toHaveBeenCalledTimes(2));
    expect(performAction.mock.calls[1][0]).toEqual(undoKnown);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Markering ongedaan maken" }),
      ).not.toBeInTheDocument(),
    );

  });

  test("keeps same-presentation undo available when session storage is unavailable", async () => {
    const onProgressActionAccepted = vi.fn();
    const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "sessionStorage",
    );
    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new Error("storage_unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage_unavailable");
      }),
      removeItem: vi.fn(() => {
        throw new Error("storage_unavailable");
      }),
    };
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: unavailableStorage,
    });
    performAction.mockResolvedValueOnce({
      contractVersion: "platform-action-v2",
      actionId: "mark-known",
      clientEventId: "event-known-memory-fallback",
      accepted: true,
      card: {
        cardTypeId: "word-to-definition",
        scheduler: { phase: "hidden", repeatCount: 3 },
        knownMark: {
          markId: "20b34a88-b29d-4a72-89e5-49221af7ca27",
          revision: "ef774f0a-59a4-420a-b2e2-85a544050892",
          markedAt: "2026-08-05T10:00:00.000Z",
        },
        stateRevision: "0d0a9b93-7b67-49ca-a12c-47821c68ce8d",
      },
    });

    try {
      render(
        <>
          <TestTrainingSenseCardV2Session
            word={word}
            mode="word-to-definition"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="nl"
            onProgressActionAccepted={onProgressActionAccepted}
          />
          <TrainingKnownUndoNotice
            interfaceLanguage="nl"
            currentPresentationIdentity={testPresentationIdentity(
              word,
              "word-to-definition",
            )}
          />
        </>,
      );

      await screen.findByRole("heading", { name: "hand" });
      fireEvent.click(
        screen.getByRole("button", { name: "Markeer als bekend" }),
      );

      const undo = await screen.findByRole("button", {
        name: "Markering ongedaan maken",
      });
      fireEvent.click(undo);
      await waitFor(() => expect(performAction).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(
          screen.queryByRole("button", {
            name: "Markering ongedaan maken",
          }),
        ).not.toBeInTheDocument(),
      );
    } finally {
      if (sessionStorageDescriptor) {
        Object.defineProperty(
          window,
          "sessionStorage",
          sessionStorageDescriptor,
        );
      } else {
        delete (window as { sessionStorage?: Storage }).sessionStorage;
      }
    }
  });

  test("advances after mark-known without depending on a post-action lookup", async () => {
    const onProgressActionAccepted = vi.fn();
    const markKnown = singleSenseEntry.capabilities.find(
      (candidate) => candidate.actionId === "mark-known",
    )!;
    performAction.mockResolvedValueOnce({
      contractVersion: "platform-action-v2",
      actionId: "mark-known",
      clientEventId: "event-known",
      accepted: true,
      card: {
        cardTypeId: "word-to-definition",
        scheduler: { phase: "hidden", repeatCount: 3 },
        knownMark: {
          markId: "20b34a88-b29d-4a72-89e5-49221af7ca27",
          revision: "ef774f0a-59a4-420a-b2e2-85a544050892",
          markedAt: "2026-08-05T10:00:00.000Z",
        },
        stateRevision: "0d0a9b93-7b67-49ca-a12c-47821c68ce8d",
      },
    });

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={onProgressActionAccepted}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Markeer als bekend" }));

    await waitFor(() =>
      expect(onProgressActionAccepted).toHaveBeenCalledWith(markKnown),
    );
    expect(fetchSingleSense).toHaveBeenCalledTimes(1);
  });

  test("dismisses the Mark Known success notice when the next card is presented", async () => {
    const markKnown = singleSenseEntry.capabilities.find(
      (candidate) => candidate.actionId === "mark-known",
    )!;
    const nextEntry = {
      ...singleSenseEntry,
      entryId: "entry-bank-after-known",
      contentRevision: "content-bank-after-known",
    };
    const nextGroup = {
      ...singleSenseGroup,
      headwordGroupId: "group-bank-after-known",
      header: {
        ...singleSenseGroup.header,
        text: "bank",
        displayPronunciation: "bank",
      },
      entries: [nextEntry],
    };
    fetchSingleSense
      .mockResolvedValueOnce({
        state: "ready",
        group: singleSenseGroup,
        entry: singleSenseEntry,
      })
      .mockResolvedValueOnce({
        state: "ready",
        group: nextGroup,
        entry: nextEntry,
      });
    performAction.mockResolvedValueOnce({
      contractVersion: "platform-action-v2",
      actionId: "mark-known",
      clientEventId: "event-known-next-card",
      accepted: true,
      card: {
        cardTypeId: "word-to-definition",
        scheduler: { phase: "hidden", repeatCount: 3 },
        knownMark: {
          markId: "20b34a88-b29d-4a72-89e5-49221af7ca27",
          revision: "ef774f0a-59a4-420a-b2e2-85a544050892",
          markedAt: "2026-08-05T10:00:00.000Z",
        },
        stateRevision: "0d0a9b93-7b67-49ca-a12c-47821c68ce8d",
      },
    });

    const renderSession = (nextWord: TrainingWord) => (
      <>
        <TestTrainingSenseCardV2Session
          word={nextWord}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          onProgressActionAccepted={vi.fn()}
        />
        <TrainingKnownUndoNotice
          interfaceLanguage="nl"
          currentPresentationIdentity={testPresentationIdentity(
            nextWord,
            "word-to-definition",
          )}
        />
      </>
    );
    const view = render(renderSession(word));

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Markeer als bekend" }));
    expect(
      await screen.findByRole("button", { name: "Markering ongedaan maken" }),
    ).toBeInTheDocument();

    view.rerender(
      renderSession({ ...word, id: nextEntry.entryId, headword: "bank" }),
    );
    await screen.findByRole("heading", { name: "bank" });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Markering ongedaan maken" }),
      ).not.toBeInTheDocument(),
    );

    expect(performAction).toHaveBeenCalledWith(
      markKnown,
      expect.objectContaining({ onRequestFrozen: expect.any(Function) }),
    );
  });

  test("does not resurrect a Known notice when the same entry gets a new presentation", async () => {
    performAction.mockResolvedValueOnce({
      contractVersion: "platform-action-v2",
      actionId: "mark-known",
      clientEventId: "event-known-repeated-entry",
      accepted: true,
      card: {
        cardTypeId: "word-to-definition",
        scheduler: { phase: "hidden", repeatCount: 3 },
        knownMark: {
          markId: "20b34a88-b29d-4a72-89e5-49221af7ca27",
          revision: "ef774f0a-59a4-420a-b2e2-85a544050892",
          markedAt: "2026-08-05T10:00:00.000Z",
        },
        stateRevision: "0d0a9b93-7b67-49ca-a12c-47821c68ce8d",
      },
    });
    const renderPresentation = (
      presentationIdentity: string,
      mode: "word-to-definition" | "definition-to-word",
    ) => (
      <>
        <TestTrainingSenseCardV2Session
          word={word}
          mode={mode}
          presentationIdentity={presentationIdentity}
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          onProgressActionAccepted={vi.fn()}
        />
        <TrainingKnownUndoNotice
          interfaceLanguage="nl"
          currentPresentationIdentity={presentationIdentity}
        />
      </>
    );
    const view = render(
      renderPresentation("repeated-entry-presentation-1", "word-to-definition"),
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Markeer als bekend" }));
    expect(
      await screen.findByRole("button", { name: "Markering ongedaan maken" }),
    ).toBeInTheDocument();

    view.rerender(
      renderPresentation("repeated-entry-presentation-2", "word-to-definition"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Markering ongedaan maken" }),
      ).not.toBeInTheDocument(),
    );

    view.rerender(
      renderPresentation("repeated-entry-presentation-3", "definition-to-word"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Markering ongedaan maken" }),
      ).not.toBeInTheDocument(),
    );

    view.rerender(
      renderPresentation("repeated-entry-presentation-1", "word-to-definition"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Markering ongedaan maken" }),
      ).not.toBeInTheDocument(),
    );
  });

  test("discards an Undo failure that settles after the presentation changes", async () => {
    performAction.mockResolvedValueOnce({
      contractVersion: "platform-action-v2",
      actionId: "mark-known",
      clientEventId: "event-known-pending-undo",
      accepted: true,
      card: {
        cardTypeId: "word-to-definition",
        scheduler: { phase: "hidden", repeatCount: 3 },
        knownMark: {
          markId: "20b34a88-b29d-4a72-89e5-49221af7ca27",
          revision: "ef774f0a-59a4-420a-b2e2-85a544050892",
          markedAt: "2026-08-05T10:00:00.000Z",
        },
        stateRevision: "0d0a9b93-7b67-49ca-a12c-47821c68ce8d",
      },
    });
    let rejectUndo!: (cause: Error) => void;
    const renderPresentation = (presentationIdentity: string) => (
      <>
        <TestTrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          presentationIdentity={presentationIdentity}
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          onProgressActionAccepted={vi.fn()}
        />
        <TrainingKnownUndoNotice
          interfaceLanguage="nl"
          currentPresentationIdentity={presentationIdentity}
        />
      </>
    );
    const view = render(renderPresentation("pending-undo-presentation-1"));

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Markeer als bekend" }));
    const undo = await screen.findByRole("button", {
      name: "Markering ongedaan maken",
    });
    performAction.mockImplementationOnce(
      () => new Promise((_, reject) => { rejectUndo = reject; }),
    );
    fireEvent.click(undo);
    view.rerender(renderPresentation("pending-undo-presentation-2"));

    await act(async () => rejectUndo(new Error("stale_undo_failure")));
    await waitFor(() =>
      expect(screen.queryByText("stale_undo_failure")).not.toBeInTheDocument(),
    );
  });

  test("resolves and plays audio from the DTO header capability", async () => {
    const onPlayResolvedAudio = vi.fn();

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onPlayResolvedAudio={onPlayResolvedAudio}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    await waitFor(() =>
      expect(preloadAudio).toHaveBeenCalledWith({
        cacheOwnerId: "test-user",
        capability: singleSenseGroup.header.audio,
        text: "hand",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Afspelen" }));

    await waitFor(() =>
      expect(resolveAudio).toHaveBeenCalledWith({
        cacheOwnerId: "test-user",
        capability: singleSenseGroup.header.audio,
        text: "hand",
      }),
    );
    expect(onPlayResolvedAudio).toHaveBeenCalledWith(
      "/audio/hand.mp3",
      "hand",
    );
  });

  test.each([
    { mode: "word-to-definition", faceAudioVisible: true },
    { mode: "definition-to-word", faceAudioVisible: false },
  ] as const)(
    "renders projected audio safely for $mode",
    async ({ mode, faceAudioVisible }) => {
      const projected = projectedTrainingAudioResult(mode, true);
      fetchSingleSense.mockResolvedValue(projected);

      render(
        <TestTrainingSenseCardV2Session
          word={{ ...word, mode }}
          mode={mode}
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          onPlayResolvedAudio={vi.fn()}
          onProgressActionAccepted={vi.fn()}
        />,
      );

      await screen.findByTestId("training-sense-card-v2");
      const faceAudio = screen.queryByRole("button", { name: "Afspelen" });
      if (faceAudioVisible) expect(faceAudio).toBeVisible();
      else expect(faceAudio).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
      expect(screen.getByTestId("training-sense-card-stage")).toHaveAttribute(
        "data-side",
        "answer",
      );
      expect(screen.getByRole("button", { name: "Afspelen" })).toBeVisible();
    },
  );

  test("does not invent an audio action when projection has no capability", async () => {
    fetchSingleSense.mockResolvedValue(
      projectedTrainingAudioResult("word-to-definition", false),
    );

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="en"
        translationTargetLanguageCode="nl"
        interfaceLanguage="nl"
        onPlayResolvedAudio={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    expect(
      screen.queryByRole("button", { name: "Afspelen" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    expect(
      screen.queryByRole("button", { name: "Afspelen" }),
    ).not.toBeInTheDocument();
  });

  test("keeps revealed reverse audio visible while resolution is pending", async () => {
    fetchSingleSense.mockResolvedValue(
      projectedTrainingAudioResult("definition-to-word", true),
    );
    resolveAudio.mockImplementationOnce(() => new Promise(() => {}));

    render(
      <TestTrainingSenseCardV2Session
        word={{ ...word, mode: "definition-to-word" }}
        mode="definition-to-word"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onPlayResolvedAudio={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByTestId("training-sense-card-v2");
    expect(
      screen.queryByRole("button", { name: "Afspelen" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    const audioButton = screen.getByRole("button", { name: "Afspelen" });
    fireEvent.click(audioButton);

    await waitFor(() => expect(audioButton).toBeDisabled());
    expect(audioButton).toBeVisible();
  });

  test("keeps revealed reverse audio visible after resolution fails", async () => {
    fetchSingleSense.mockResolvedValue(
      projectedTrainingAudioResult("definition-to-word", true),
    );
    resolveAudio.mockRejectedValueOnce(new Error("audio_failed"));

    render(
      <TestTrainingSenseCardV2Session
        word={{ ...word, mode: "definition-to-word" }}
        mode="definition-to-word"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onPlayResolvedAudio={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByTestId("training-sense-card-v2");
    expect(
      screen.queryByRole("button", { name: "Afspelen" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Afspelen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("audio_failed");
    expect(screen.getByRole("button", { name: "Afspelen" })).toBeVisible();
  });

  test("refreshes a genuinely newer remote state without advancing", async () => {
    performAction.mockRejectedValueOnce(new Error("state_conflict"));
    const onProgressActionAccepted = vi.fn();

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={onProgressActionAccepted}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Good" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The card changed elsewhere. Its latest state is now shown.",
    );
    expect(screen.getByRole("heading", { name: "hand" })).toBeInTheDocument();
    expect(fetchSingleSense).toHaveBeenCalledTimes(2);
    expect(onProgressActionAccepted).not.toHaveBeenCalled();
  });

  test("keeps the card and reports a temporary failure when conflict refresh fails", async () => {
    performAction.mockRejectedValueOnce(new Error("state_conflict"));
    fetchSingleSense
      .mockResolvedValueOnce({
        state: "ready",
        group: singleSenseGroup,
        entry: singleSenseEntry,
      })
      .mockResolvedValueOnce({ state: "lookup-http-error", status: 503 });

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Good" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The connection was interrupted. Please try again.",
    );
    expect(screen.getByRole("heading", { name: "hand" })).toBeInTheDocument();
    expect(screen.queryByTestId("training-v2-failure")).not.toBeInTheDocument();
  });

  test("keeps a no-receipt ambiguous review recoverable", async () => {
    performAction.mockRejectedValueOnce(
      new Error("action_receipt_not_found"),
    );

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Good" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The connection was interrupted. Please try again.",
    );
    expect(screen.getByRole("heading", { name: "hand" })).toBeInTheDocument();
  });

  test("submits only one action for two immediate grade clicks", async () => {
    let resolveAction!: (value: unknown) => void;
    performAction.mockImplementationOnce(
      () => new Promise((resolve) => { resolveAction = resolve; }),
    );
    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    fireEvent.click(screen.getByRole("button", { name: "Hard" }));

    expect(performAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveAction({
        contractVersion: "platform-action-v2",
        actionId: "review-card",
        clientEventId: "event-1",
        accepted: true,
        card: singleSenseEntry.card,
      });
    });
  });

  test("clears a transient action error instead of leaving it forever", async () => {
    performAction.mockRejectedValueOnce(new Error("state_conflict"));
    try {
      render(
        <TestTrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
          onProgressActionAccepted={vi.fn()}
        />,
      );
      await screen.findByRole("heading", { name: "hand" });
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Good" }));
      });
      expect(
        screen.getByText("The card changed elsewhere. Its latest state is now shown."),
      ).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        screen.queryByText("The card changed elsewhere. Its latest state is now shown."),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("keeps the current card mounted while translation refreshes", async () => {
    let resolveRefresh!: (value: unknown) => void;
    const requestCapability = {
      actionId: "request-translation" as const,
      elementId: "sense-card.translation.request",
      messageKey: "senseCard.translation.request",
      target: {
        kind: "entry" as const,
        entryId: singleSenseEntry.entryId,
        contentRevision: singleSenseEntry.contentRevision,
      },
      targetLanguageCode: "en",
    };
    const untranslatedEntry = {
      ...singleSenseEntry,
      translation: null,
      contentNodes: singleSenseEntry.contentNodes.map((node) => ({
        ...node,
        translations: [],
      })),
      capabilities: [...singleSenseEntry.capabilities, requestCapability],
    };
    fetchSingleSense
      .mockResolvedValueOnce({
        state: "ready",
        group: { ...singleSenseGroup, entries: [untranslatedEntry] },
        entry: untranslatedEntry,
      })
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveRefresh = resolve; }),
      );

    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "hand" });
    expect(requestTranslation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(requestTranslation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    await waitFor(() =>
      expect(requestTranslation).toHaveBeenCalledWith(requestCapability),
    );

    expect(screen.getByRole("heading", { name: "hand" })).toBeInTheDocument();
    expect(screen.queryByTestId("training-v2-loading")).not.toBeInTheDocument();

    await act(async () => {
      resolveRefresh({
        state: "ready",
        group: singleSenseGroup,
        entry: singleSenseEntry,
      });
    });
  });

  test("ignores a stale lookup that resolves after the card context changes", async () => {
    let resolveOld!: (value: unknown) => void;
    fetchSingleSense.mockImplementation(
      (input: { translationTargetLanguageCode: string }) =>
        input.translationTargetLanguageCode === "en"
          ? new Promise((resolve) => {
              resolveOld = resolve;
            })
          : Promise.resolve({
              state: "ready",
              group: {
                ...singleSenseGroup,
                header: {
                  ...singleSenseGroup.header,
                  text: "new-hand",
                  displayPronunciation: "new-hand",
                },
              },
              entry: singleSenseEntry,
            }),
    );

    const view = render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(fetchSingleSense).toHaveBeenCalledWith(
        expect.objectContaining({ translationTargetLanguageCode: "en" }),
      ),
    );
    view.rerender(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="ru"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: "new-hand" })).toBeInTheDocument();
    await act(async () => {
      resolveOld({
        state: "ready",
        group: singleSenseGroup,
        entry: singleSenseEntry,
      });
    });
    expect(screen.getByRole("heading", { name: "new-hand" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "hand" })).not.toBeInTheDocument();
  });

  test("shows an explicit error when reverse content has no definition", async () => {
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: {
        ...singleSenseEntry,
        contentNodes: singleSenseEntry.contentNodes.filter(
          (node) => node.kind !== "definition",
        ),
      },
    });
    render(
      <TestTrainingSenseCardV2Session
        word={{ ...word, mode: "definition-to-word" }}
        mode="definition-to-word"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveAttribute(
      "data-training-v2-state",
      "reverse-definition-missing",
    );
    expect(screen.queryByText("Legacy card")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: singleSenseGroup.header.text }),
    ).not.toBeInTheDocument();
  });

  test("classifies an invalid V2 presentation model", async () => {
    fetchSingleSense.mockResolvedValue({
      state: "ready",
      group: {
        ...singleSenseGroup,
        header: { ...singleSenseGroup.header, text: "", displayPronunciation: null },
      },
      entry: singleSenseEntry,
    });
    render(
      <TestTrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onProgressActionAccepted={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveAttribute(
      "data-training-v2-state",
      "model-invalid",
    );
    expect(screen.queryByText("Legacy card")).not.toBeInTheDocument();
  });

});
