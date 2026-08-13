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
import { goedEntry, goedGroup } from "./platformV2IdiomHierarchyFixture";
import type { PlatformHeadwordGroupV2 } from "../../../packages/shared/types/platformV2";

const fetchGroup = vi.fn();
const requestTranslation = vi.fn();
const performAction = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function singleSenseGroup(
  headwordGroupId: string,
  entryId: string,
  headword: string,
  definition: string,
): PlatformHeadwordGroupV2 {
  return {
    ...multiSenseBankGroup,
    headwordGroupId,
    header: {
      ...multiSenseBankGroup.header,
      text: headword,
      displayPronunciation: headword,
    },
    senseCount: 1,
    entryCount: 1,
    entries: [
      {
        ...financeEntry,
        entryId,
        contentRevision: `content-${entryId}`,
        contentNodes: financeEntry.contentNodes.map((node, index) => ({
          ...node,
          contentNodeId: `${node.kind}-${entryId}`,
          text: index === 0 ? definition : node.text,
        })),
      },
    ],
  };
}

vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2MultiSenseGroup: (...args: unknown[]) => fetchGroup(...args),
  requestPlatformV2LibraryTranslation: (...args: unknown[]) =>
    requestTranslation(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingActionClient", () => ({
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

  test("routes an exact idiom node report through the real Library session", async () => {
    fetchGroup.mockResolvedValue(goedGroup);

    render(
      <LibrarySenseCardV2Session
        entryId={goedEntry.entryId}
        headword="goed"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        fallback={<p>Legacy detail</p>}
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Report: iets is bestemd voor iemand of iets; iets is gunstig voor iemand of iets",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Reporting is not available yet.");
    expect(performAction).not.toHaveBeenCalled();
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

    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Translate",
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
    expect(
      await screen.findByTestId("library-sense-card-group"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Legacy detail")).not.toBeInTheDocument();
  });

  test("never presents an older group during rapid selections with out-of-order responses", async () => {
    const bankRequest = deferred<PlatformHeadwordGroupV2>();
    const bridgeRequest = deferred<PlatformHeadwordGroupV2>();
    const canalRequest = deferred<PlatformHeadwordGroupV2>();
    const requests = {
      [financeEntry.entryId]: bankRequest,
      "entry-bridge": bridgeRequest,
      "entry-canal": canalRequest,
    };
    fetchGroup.mockImplementation(
      ({ entryId }: { entryId: keyof typeof requests }) =>
        requests[entryId].promise,
    );

    const committedFrames: Array<{ entryId: string; text: string }> = [];

    function SelectionHarness() {
      const [selection, setSelection] = React.useState({
        entryId: financeEntry.entryId,
        headword: "bank",
      });

      React.useLayoutEffect(() => {
        committedFrames.push({
          entryId: selection.entryId,
          text: document.body.textContent ?? "",
        });
      }, [selection]);

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setSelection({ entryId: "entry-bridge", headword: "brug" })
            }
          >
            Select bridge
          </button>
          <button
            type="button"
            onClick={() =>
              setSelection({ entryId: "entry-canal", headword: "gracht" })
            }
          >
            Select canal
          </button>
          <LibrarySenseCardV2Session
            entryId={selection.entryId}
            headword={selection.headword}
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
            fallback={<p>Loading {selection.headword} details</p>}
          />
        </>
      );
    }

    render(<SelectionHarness />);
    await act(async () => {
      bankRequest.resolve(multiSenseBankGroup);
    });
    expect(await screen.findByText("bank")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select bridge" }));
    fireEvent.click(screen.getByRole("button", { name: "Select canal" }));

    expect(
      committedFrames.find(({ entryId }) => entryId === "entry-bridge")?.text,
    ).toContain("Loading brug details");
    expect(
      committedFrames.find(({ entryId }) => entryId === "entry-canal")?.text,
    ).toContain("Loading gracht details");

    await act(async () => {
      canalRequest.resolve(
        singleSenseGroup(
          "group-canal",
          "entry-canal",
          "gracht",
          "a canal in a city",
        ),
      );
    });
    expect(
      await screen.findByRole("heading", { name: "gracht" }),
    ).toBeInTheDocument();

    await act(async () => {
      bridgeRequest.resolve(
        singleSenseGroup(
          "group-bridge",
          "entry-bridge",
          "brug",
          "a structure over water",
        ),
      );
    });
    expect(screen.getByRole("heading", { name: "gracht" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "brug" }),
    ).not.toBeInTheDocument();
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

    await screen.findByTestId("library-sense-card-group");
    expect(fetchGroup).toHaveBeenCalledWith(
      expect.objectContaining({ translationTargetLanguageCode: null }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Translate",
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

    await screen.findByTestId("library-sense-card-group");
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
    await screen.findByTestId("library-sense-card-group");
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
          name: "Translate",
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
    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Translate",
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
    await screen.findByTestId("library-sense-card-group");
    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Translate",
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

    await screen.findByTestId("library-sense-card-group");
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
