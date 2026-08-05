import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LibrarySenseCardV2Session } from "@/components/training/library-v2/LibrarySenseCardV2Session";
import {
  financeEntry,
  multiSenseBankGroup,
} from "./platformV2LibraryFixture";

const fetchGroup = vi.fn();
const performAction = vi.fn();

vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2MultiSenseGroup: (...args: unknown[]) => fetchGroup(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  performPlatformV2TrainingAction: (...args: unknown[]) =>
    performAction(...args),
}));

describe("LibrarySenseCardV2Session", () => {
  beforeEach(() => {
    fetchGroup.mockReset();
    performAction.mockReset();
    fetchGroup.mockResolvedValue(multiSenseBankGroup);
    performAction.mockResolvedValue({
      contractVersion: "platform-action-v2",
      actionId: "start-learning",
      clientEventId: "event-1",
      accepted: true,
      card: financeEntry.card,
    });
  });

  test("keeps fallback until a compatible group loads", async () => {
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy detail</p>}
      />,
    );

    expect(screen.getByText("Legacy detail")).toBeInTheDocument();
    expect(await screen.findByText("Meanings")).toBeInTheDocument();
    expect(screen.queryByText("Legacy detail")).not.toBeInTheDocument();
  });

  test("submits the selected meaning capability and refreshes the group", async () => {
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy detail</p>}
      />,
    );

    await screen.findByText("Meanings");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));

    await waitFor(() => expect(performAction).toHaveBeenCalledTimes(1));
    expect(performAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "start-learning",
        target: expect.objectContaining({ entryId: financeEntry.entryId }),
      }),
    );
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(2));
  });
});
