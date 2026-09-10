import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TrainingSenseCardV2Session } from "@/components/training/v2/TrainingSenseCardV2Session";
import type { TrainingWord } from "@/lib/types";
import { singleSenseEntry, singleSenseGroup } from "./platformV2TrainingFixture";

const fetchTrainingEntry = vi.hoisted(() => vi.fn());
const peekPrefetchedEntry = vi.hoisted(() => vi.fn());
const consumePrefetchedEntry = vi.hoisted(() => vi.fn());
const actionTransport = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  fetchPlatformV2TrainingEntry: (...args: unknown[]) => fetchTrainingEntry(...args),
  peekPrefetchedPlatformV2TrainingEntry: (...args: unknown[]) =>
    peekPrefetchedEntry(...args),
  consumePrefetchedPlatformV2TrainingEntry: (...args: unknown[]) =>
    consumePrefetchedEntry(...args),
  preloadPlatformV2Audio: vi.fn().mockResolvedValue(undefined),
  requestPlatformV2Translation: vi.fn().mockResolvedValue(undefined),
  resolvePlatformV2Audio: vi.fn().mockResolvedValue("/audio/hand.mp3"),
}));

vi.mock("@/lib/platform/platformV2Http", () => ({
  platformV2AuthenticatedJsonHeaders: vi.fn().mockResolvedValue({
    accept: "application/json",
    "content-type": "application/json",
  }),
}));

vi.mock("@/lib/platform/platformFetchWithTimeout", () => ({
  DEFAULT_PLATFORM_FETCH_TIMEOUT_MS: 12_000,
  platformFetchWithTimeout: (...args: unknown[]) => actionTransport(...args),
}));

vi.mock("@/lib/feedback/diagnosticReportClient", () => ({
  freezeSenseCardDiagnosticSnapshot: (input: unknown) => input,
  buildSenseCardDiagnosticReport: vi.fn(),
  queuePreparedSenseCardDiagnosticReport: vi.fn(),
}));

const word: TrainingWord = {
  id: singleSenseEntry.entryId,
  headword: "hand",
  raw: {},
  isFirstEncounter: false,
  mode: "word-to-definition",
};

function acceptedActionResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      contractVersion: "platform-action-v2",
      actionId: "review-card",
      clientEventId: "event-1",
      accepted: true,
      card: singleSenseEntry.card,
    }),
  };
}

describe("TrainingSenseCardV2Session action boundary", () => {
  beforeEach(() => {
    fetchTrainingEntry.mockReset().mockResolvedValue({
      state: "ready",
      group: singleSenseGroup,
      entry: singleSenseEntry,
    });
    peekPrefetchedEntry.mockReset().mockReturnValue(null);
    consumePrefetchedEntry.mockReset().mockReturnValue(null);
    actionTransport.mockReset().mockResolvedValue(acceptedActionResponse());
  });

  test("does not POST a new card action while predecessor acceptance is unsettled", async () => {
    let releaseAcceptance!: () => void;
    const acceptanceSettled = new Promise<void>((resolve) => {
      releaseAcceptance = resolve;
    });

    function BoundaryHarness() {
      const [presentationIdentity, setPresentationIdentity] =
        React.useState("presentation-1");
      const [actionPending, setActionPending] = React.useState(false);

      return (
        <TrainingSenseCardV2Session
          key={presentationIdentity}
          cacheOwnerId="test-user"
          presentationIdentity={presentationIdentity}
          word={word}
          mode="word-to-definition"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="nl"
          chrome={<div />}
          footer={<div />}
          interactionDisabled={actionPending}
          onProgressActionPendingChange={setActionPending}
          onProgressActionAccepted={async () => {
            // The controller may present the next keyed session before the
            // predecessor's V2 handler finally clears its pending flag.
            setPresentationIdentity("presentation-2");
            await acceptanceSettled;
            return "accepted";
          }}
        />
      );
    }

    try {
      render(<BoundaryHarness />);
      await screen.findByRole("heading", { name: "hand" });
      fireEvent.click(screen.getByRole("button", { name: "Antwoord tonen" }));
      fireEvent.click(screen.getByRole("button", { name: "Goed" }));

      await waitFor(() =>
        expect(actionTransport).toHaveBeenCalledTimes(1),
      );
      expect(actionTransport).toHaveBeenNthCalledWith(
        1,
        "/api/platform/v2/actions",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"actionId":"review-card"'),
        }),
      );
      const nextShowAnswer = await screen.findByRole("button", {
        name: "Antwoord tonen",
      });
      expect(nextShowAnswer).toBeDisabled();
      fireEvent.click(nextShowAnswer);
      expect(actionTransport).toHaveBeenCalledTimes(1);

      await act(async () => releaseAcceptance());
      await waitFor(() => expect(nextShowAnswer).toBeEnabled());
      fireEvent.click(nextShowAnswer);
      const nextGood = await screen.findByRole("button", { name: "Goed" });
      fireEvent.click(nextGood);
      await waitFor(() => expect(actionTransport).toHaveBeenCalledTimes(2));
    } finally {
      releaseAcceptance();
    }
  });
});
