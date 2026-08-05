import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LibrarySenseCardV2Session } from "@/components/training/library-v2/LibrarySenseCardV2Session";
import { financeEntry, multiSenseBankGroup } from "./platformV2LibraryFixture";

const fetchGroup = vi.fn();
const requestTranslation = vi.fn();
const performAction = vi.fn();

vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2MultiSenseGroup: (...args: unknown[]) => fetchGroup(...args),
  requestPlatformV2LibraryTranslation: (...args: unknown[]) =>
    requestTranslation(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  performPlatformV2TrainingAction: (...args: unknown[]) =>
    performAction(...args),
}));

describe("LibrarySenseCardV2Session", () => {
  beforeEach(() => {
    fetchGroup.mockReset();
    performAction.mockReset();
    requestTranslation.mockReset();
    fetchGroup.mockResolvedValue(multiSenseBankGroup);
    performAction.mockResolvedValue({
      contractVersion: "platform-action-v2",
      actionId: "start-learning",
      clientEventId: "event-1",
      accepted: true,
      card: financeEntry.card,
    });
  });

  test("keeps translation failure local and offers a retry", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? { ...entry, translation: null }
          : entry,
      ),
    });
    requestTranslation.mockRejectedValueOnce(new Error("provider_failed"));
    requestTranslation.mockResolvedValueOnce("pending");

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
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show translation for meaning 2",
      }),
    );
    expect(
      await screen.findByText("Translation could not be loaded."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Translation is being prepared…"),
    ).toBeInTheDocument();
    expect(requestTranslation).toHaveBeenCalledTimes(2);
    expect(requestTranslation).toHaveBeenLastCalledWith(
      expect.objectContaining({ force: true }),
    );
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

  test("normalizes the translation-off sentinel before lookup", async () => {
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="off"
        interfaceLanguage="en"
        fallback={<p>Legacy detail</p>}
      />,
    );

    await screen.findByText("Meanings");
    expect(fetchGroup).toHaveBeenCalledWith(
      expect.objectContaining({ translationTargetLanguageCode: null }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Show translation for meaning 1",
      }),
    ).not.toBeInTheDocument();
  });

  test("hydrates a failed translation state returned by lookup", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? {
              ...entry,
              translation: {
                ...financeEntry.translation!,
                status: "failed" as const,
                text: undefined,
              },
            }
          : entry,
      ),
    });
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
    expect(
      await screen.findByText("Translation could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  test("polls a pending translation until it becomes ready", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? { ...entry, translation: null }
          : entry,
      ),
    });
    requestTranslation
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("ready");
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

    let poll: (() => void) | null = null;
    const timeout = vi
      .spyOn(window, "setTimeout")
      .mockImplementation((handler, delay) => {
        if (delay === 3000 && typeof handler === "function") {
          poll = handler as () => void;
        }
        return 77 as never;
      });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Show translation for meaning 2",
        }),
      );
    });
    expect(requestTranslation).toHaveBeenCalledTimes(1);
    expect(poll).not.toBeNull();

    await act(async () => poll?.());
    expect(requestTranslation).toHaveBeenCalledTimes(2);
    expect(fetchGroup).toHaveBeenCalledTimes(2);
    timeout.mockRestore();
  });

  test("cancels pending translation polling when the selected entry changes", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? { ...entry, translation: null }
          : entry,
      ),
    });
    requestTranslation.mockResolvedValue("pending");
    const { rerender } = render(
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

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Show translation for meaning 2",
        }),
      );
    });
    expect(requestTranslation).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <LibrarySenseCardV2Session
          entryId="entry-next"
          headword="next"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
          fallback={<p>Next legacy detail</p>}
        />,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(requestTranslation).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test("ignores an in-flight translation result after navigation", async () => {
    fetchGroup.mockResolvedValue({
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
          ? { ...entry, translation: null }
          : entry,
      ),
    });
    let resolveTranslation: ((status: "ready") => void) | null = null;
    requestTranslation.mockReturnValue(
      new Promise<"ready">((resolve) => {
        resolveTranslation = resolve;
      }),
    );
    const { rerender } = render(
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
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show translation for meaning 2",
      }),
    );
    expect(requestTranslation).toHaveBeenCalledTimes(1);

    rerender(
      <LibrarySenseCardV2Session
        entryId="entry-next"
        headword="next"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Next legacy detail</p>}
      />,
    );
    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(2));
    await act(async () => resolveTranslation?.("ready"));

    expect(fetchGroup).toHaveBeenCalledTimes(2);
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
