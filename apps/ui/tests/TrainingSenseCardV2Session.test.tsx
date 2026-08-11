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
const preloadTranslation = vi.fn();

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  fetchPlatformV2TrainingEntry: (...args: unknown[]) => fetchSingleSense(...args),
  peekPrefetchedPlatformV2TrainingEntry: (...args: unknown[]) => peekPrefetched(...args),
  consumePrefetchedPlatformV2TrainingEntry: (...args: unknown[]) => consumePrefetched(...args),
  isPlatformV2TrainingActionCapability: (capability: { actionId: string }) =>
    ["start-learning", "mark-known", "undo-known", "review-card"].includes(
      capability.actionId,
    ),
  performPlatformV2TrainingAction: (...args: unknown[]) =>
    performAction(...args),
  resolvePlatformV2Audio: (...args: unknown[]) => resolveAudio(...args),
  preloadPlatformV2Audio: (...args: unknown[]) => preloadAudio(...args),
  preloadPlatformV2Translation: (...args: unknown[]) => preloadTranslation(...args),
  requestPlatformV2Translation: (...args: unknown[]) => requestTranslation(...args),
}));

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
    preloadTranslation.mockReset();
    peekPrefetched.mockReturnValue(null);
    consumePrefetched.mockReturnValue(null);
    requestTranslation.mockResolvedValue(undefined);
    preloadAudio.mockResolvedValue(undefined);
    preloadTranslation.mockResolvedValue(undefined);
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
    const onAvailabilityChange = vi.fn();
    const onProgressActionAccepted = vi.fn();

    render(
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={onAvailabilityChange}
        onProgressActionAccepted={onProgressActionAccepted}
      />,
    );

    expect(screen.getByTestId("training-v2-loading")).toHaveAttribute(
      "data-training-v2-state",
      "loading",
    );
    expect(screen.queryByText("Legacy card")).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: "hand" });
    await waitFor(() => expect(onAvailabilityChange).toHaveBeenCalledWith("ready"));
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
    expect(onProgressActionAccepted).toHaveBeenCalledWith(capability);
  });

  test("shows an explicit V2 error instead of the legacy card when lookup returns HTTP 500", async () => {
    fetchSingleSense.mockResolvedValue({
      state: "lookup-http-error",
      status: 500,
    });

    render(
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
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
        <TrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
          fallback={<p>Legacy card</p>}
          onAvailabilityChange={vi.fn()}
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
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "hand" })).toBeInTheDocument();
    expect(fetchSingleSense).toHaveBeenCalledTimes(2);
  });

  test("keeps a rejected retry recoverable instead of getting stuck loading", async () => {
    fetchSingleSense
      .mockResolvedValueOnce({ state: "entry-not-found" })
      .mockRejectedValueOnce(new Error("Failed to fetch"));
    render(
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
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
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
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
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    const liveRegion = view.container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    view.rerender(
      <TrainingSenseCardV2Session
        word={{ ...word, id: nextEntry.entryId, headword: "bank" }}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
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
        <TrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          fallback={<p>Legacy card</p>}
          onAvailabilityChange={vi.fn()}
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
        <TrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          fallback={<p>Legacy card</p>}
          onAvailabilityChange={vi.fn()}
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
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
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
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        fallback={<p>Legacy card</p>}
        onPlayResolvedAudio={onPlayResolvedAudio}
        onAvailabilityChange={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    await waitFor(() =>
      expect(preloadAudio).toHaveBeenCalledWith({
        capability: singleSenseGroup.header.audio,
        text: "hand",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Afspelen" }));

    await waitFor(() =>
      expect(resolveAudio).toHaveBeenCalledWith({
        capability: singleSenseGroup.header.audio,
        text: "hand",
      }),
    );
    expect(onPlayResolvedAudio).toHaveBeenCalledWith(
      "/audio/hand.mp3",
      "hand",
    );
  });

  test("shows action failures without replacing the rendered card", async () => {
    performAction.mockRejectedValueOnce(new Error("state_conflict"));

    render(
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Good" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The card changed elsewhere. Its latest state is now shown.",
    );
    expect(screen.getByRole("heading", { name: "hand" })).toBeInTheDocument();
  });

  test("submits only one action for two immediate grade clicks", async () => {
    let resolveAction!: (value: unknown) => void;
    performAction.mockImplementationOnce(
      () => new Promise((resolve) => { resolveAction = resolve; }),
    );
    render(
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
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
        <TrainingSenseCardV2Session
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
          fallback={<p>Legacy card</p>}
          onAvailabilityChange={vi.fn()}
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
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "hand" });
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await waitFor(() => expect(preloadTranslation).toHaveBeenCalled());

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
    const onAvailabilityChange = vi.fn();

    render(
      <TrainingSenseCardV2Session
        word={{ ...word, mode: "definition-to-word" }}
        mode="definition-to-word"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="nl"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={onAvailabilityChange}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveAttribute(
      "data-training-v2-state",
      "reverse-definition-missing",
    );
    expect(screen.queryByText("Legacy card")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onAvailabilityChange).toHaveBeenLastCalledWith(
        "reverse-definition-missing",
      ),
    );
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
      <TrainingSenseCardV2Session
        word={word}
        mode="word-to-definition"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy card</p>}
        onAvailabilityChange={vi.fn()}
        onProgressActionAccepted={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveAttribute(
      "data-training-v2-state",
      "model-invalid",
    );
    expect(screen.queryByText("Legacy card")).not.toBeInTheDocument();
  });

  test.each(["listen-recognize", "listen-type"] as const)(
    "keeps %s on an explicitly classified listening renderer",
    async (mode) => {
      const onAvailabilityChange = vi.fn();
      render(
        <TrainingSenseCardV2Session
          word={{ ...word, mode }}
          mode={mode}
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
          fallback={<p>Legacy listening card</p>}
          onAvailabilityChange={onAvailabilityChange}
          onProgressActionAccepted={vi.fn()}
        />,
      );

      expect(screen.getByText("Legacy listening card").parentElement).toHaveAttribute(
        "data-training-v2-state",
        "listening-mode",
      );
      expect(screen.getByText("Legacy listening card").parentElement).toHaveAttribute(
        "data-training-renderer",
        "legacy",
      );
      expect(fetchSingleSense).not.toHaveBeenCalled();
      expect(onAvailabilityChange).toHaveBeenCalledWith("listening-mode");
    },
  );
});
