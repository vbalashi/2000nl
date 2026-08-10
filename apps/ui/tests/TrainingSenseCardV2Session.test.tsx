import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  fetchPlatformV2TrainingEntry: (...args: unknown[]) => fetchSingleSense(...args),
  isPlatformV2TrainingActionCapability: (capability: { actionId: string }) =>
    ["start-learning", "mark-known", "undo-known", "review-card"].includes(
      capability.actionId,
    ),
  performPlatformV2TrainingAction: (...args: unknown[]) =>
    performAction(...args),
  resolvePlatformV2Audio: (...args: unknown[]) => resolveAudio(...args),
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
    resolveAudio.mockResolvedValue("/audio/hand.mp3");
    fetchSingleSense.mockResolvedValue({
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

    expect(screen.getByText("Legacy card")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "hand" });
    expect(onAvailabilityChange).toHaveBeenCalledWith(true);

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
      .mockResolvedValueOnce({ group: singleSenseGroup, entry: singleSenseEntry })
      .mockResolvedValueOnce({ group: nextGroup, entry: nextEntry });
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
    expect(view.container.querySelector('[aria-live="polite"]')).toBe(
      liveRegion,
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
      .mockResolvedValueOnce({ group: singleSenseGroup, entry: singleSenseEntry })
      .mockResolvedValueOnce({ group: singleSenseGroup, entry: knownEntry });
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

    expect(await screen.findByRole("status")).toHaveTextContent(
      "state_conflict",
    );
    expect(screen.getByRole("heading", { name: "hand" })).toBeInTheDocument();
  });

  test("falls back instead of exposing the answer when reverse content has no definition", async () => {
    fetchSingleSense.mockResolvedValue({
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

    expect(await screen.findByText("Legacy card")).toBeInTheDocument();
    await waitFor(() =>
      expect(onAvailabilityChange).toHaveBeenLastCalledWith(false),
    );
    expect(
      screen.queryByRole("heading", { name: singleSenseGroup.header.text }),
    ).not.toBeInTheDocument();
  });
});
