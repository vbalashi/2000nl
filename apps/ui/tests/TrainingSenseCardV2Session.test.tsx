import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  TrainingKnownUndoNotice,
  TrainingSenseCardV2Session,
} from "@/components/training/v2/TrainingSenseCardV2Session";
import type { TrainingWord } from "@/lib/types";
import {
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

function TestTrainingSenseCardV2Session(
  props: Omit<
    React.ComponentProps<typeof TrainingSenseCardV2Session>,
    "cacheOwnerId"
  >,
) {
  return <TrainingSenseCardV2Session cacheOwnerId="test-user" {...props} />;
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
    peekPrefetched.mockReturnValue(null);
    consumePrefetched.mockReturnValue(null);
    requestTranslation.mockResolvedValue(undefined);
    preloadAudio.mockResolvedValue(undefined);
    resolveAudio.mockResolvedValue("/audio/hand.mp3");
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
    await waitFor(() => expect(performAction).toHaveBeenCalledWith(capability));
    expect(onProgressActionStarting).toHaveBeenCalledOnce();
    expect(onProgressActionStarting.mock.invocationCallOrder[0]).toBeLessThan(
      performAction.mock.invocationCallOrder[0]!,
    );
    expect(onProgressActionAccepted).toHaveBeenCalledWith(capability);
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

  test("gives explicit feedback when durable reporting is unavailable", async () => {
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

    expect(
      await screen.findByText("Melden is nog niet beschikbaar."),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Melden is nog niet beschikbaar.",
    );
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

  test("keeps a durable undo after marking the previous card known and advancing", async () => {
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
        <TrainingKnownUndoNotice interfaceLanguage="nl" />
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
        <TrainingKnownUndoNotice interfaceLanguage="nl" />
      </>,
    );

    expect(
      await screen.findByRole("button", { name: "Markering ongedaan maken" }),
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
