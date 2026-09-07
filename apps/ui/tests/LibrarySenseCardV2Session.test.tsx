import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  LibrarySenseCardV2Session,
  TrainingMoreSenseCardV2Session,
} from "@/components/training/library-v2/LibrarySenseCardV2Session";
import {
  financeEntry,
  furnitureEntry,
  multiSenseBankGroup,
} from "./platformV2LibraryFixture";
import { goedEntry, goedGroup } from "./platformV2IdiomHierarchyFixture";
import type {
  PlatformHeadwordGroupV2,
  PlatformSenseCardCapabilityV2,
} from "../../../packages/shared/types/platformV2";
import type { EntryLearningListMembership } from "@/lib/types";

const fetchGroup = vi.fn();
const fetchCrossReferenceTarget = vi.fn();
const requestTranslation = vi.fn();
const performAction = vi.fn();
const queueDiagnosticReport = vi.fn();
const fetchMemberships = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function membership(listId: string): EntryLearningListMembership {
  return {
    listId,
    listType: "user",
    name: listId,
    editable: true,
    isActiveTrainingList: false,
  };
}

function remapCapabilityEntryId(
  capability: PlatformSenseCardCapabilityV2,
  entryId: string,
): PlatformSenseCardCapabilityV2 {
  switch (capability.actionId) {
    case "start-learning":
    case "mark-known":
    case "review-card":
      return {
        ...capability,
        target: {
          ...capability.target,
          entryId,
          stateRevision: `state-${entryId}`,
        },
      };
    case "undo-known":
      return {
        ...capability,
        target: {
          ...capability.target,
          entryId,
          stateRevision: `state-${entryId}`,
        },
      };
    case "report-content":
      if (capability.target.kind !== "entry") return capability;
      return {
        ...capability,
        target: {
          ...capability.target,
          entryId,
          contentRevision: `content-${entryId}`,
        },
      };
    default:
      return capability;
  }
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
        capabilities: financeEntry.capabilities.map((capability) =>
          remapCapabilityEntryId(capability, entryId),
        ),
      },
    ],
  };
}

vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2LibraryGroup: (...args: unknown[]) => fetchGroup(...args),
  fetchPlatformV2CrossReferenceTarget: (...args: unknown[]) =>
    fetchCrossReferenceTarget(...args),
  requestPlatformV2LibraryTranslation: (...args: unknown[]) =>
    requestTranslation(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingActionClient", () => ({
  performPlatformV2TrainingAction: (...args: unknown[]) =>
    performAction(...args),
}));

vi.mock("@/lib/feedback/diagnosticReportClient", () => ({
  freezeSenseCardDiagnosticSnapshot: (input: unknown) => input,
  buildSenseCardDiagnosticReport: (input: unknown) => Promise.resolve(input),
  queuePreparedSenseCardDiagnosticReport: (...args: unknown[]) =>
    queueDiagnosticReport(...args),
}));

vi.mock("@/lib/trainingService", () => ({
  addWordsToUserList: vi.fn(),
  createUserList: vi.fn(),
  fetchEntryListMemberships: (...args: unknown[]) => fetchMemberships(...args),
  removeWordsFromUserList: vi.fn(),
}));

describe("LibrarySenseCardV2Session", () => {
  const groupWithFinanceReportRevision = () => ({
    ...multiSenseBankGroup,
    entries: multiSenseBankGroup.entries.map((entry) =>
      entry.kind === "sense-card" && entry.entryId === financeEntry.entryId
        ? { ...entry, reportContentRevision: "a".repeat(64) }
        : entry,
    ),
  });

  beforeEach(() => {
    fetchGroup.mockReset();
    fetchCrossReferenceTarget.mockReset();
    performAction.mockReset();
    requestTranslation.mockReset();
    queueDiagnosticReport.mockReset();
    fetchMemberships.mockReset();
    fetchGroup.mockResolvedValue(multiSenseBankGroup);
    performAction.mockResolvedValue({
      contractVersion: "platform-action-v2",
      actionId: "start-learning",
      clientEventId: "event-1",
      accepted: true,
      card: financeEntry.card,
    });
    queueDiagnosticReport.mockResolvedValue({ state: "sent" });
    fetchMemberships.mockResolvedValue(new Map());
  });

  test("uses one global report action and no per-node flags", async () => {
    fetchGroup.mockResolvedValue(groupWithFinanceReportRevision());
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onCopyToUserDictionary={vi.fn()}
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(screen.getAllByRole("button", { name: "Report" })).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Report" }).closest(
        '[data-testid="library-details-actions"]',
      ),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Report:/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(await screen.findByRole("dialog", { name: "What is wrong?" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(performAction).not.toHaveBeenCalled();
  });

  test("keeps Training More details free of global footer actions", async () => {
    const trainingGroup = groupWithFinanceReportRevision();
    const trainNext = vi.fn();

    render(
      <TrainingMoreSenseCardV2Session
        entryId={financeEntry.entryId}
        initialGroup={trainingGroup}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        userId="training-user"
        onTrainWord={trainNext}
        trainingActionEntryId={financeEntry.entryId}
        onTrainingAction={vi.fn()}
        onCopyToUserDictionary={vi.fn()}
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(screen.queryByTestId("library-details-actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Practice later (F)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hide from training (X)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy to my dictionary" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collections" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collections" }));
    expect(
      screen.getByRole("dialog", { name: "Collections for this meaning" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Train next" }));
    expect(trainNext).toHaveBeenCalledWith(financeEntry.entryId);
  });

  test("keeps idiom reporting on the sole global Library action", async () => {
    fetchGroup.mockResolvedValue({
      ...goedGroup,
      entries: goedGroup.entries.map((entry) =>
        entry.kind === "sense-card" && entry.entryId === goedEntry.entryId
          ? { ...entry, reportContentRevision: "a".repeat(64) }
          : entry,
      ),
    });

    render(
      <LibrarySenseCardV2Session
        entryId={goedEntry.entryId}
        headword="goed"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(screen.queryByRole("button", { name: /Report:/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(await screen.findByRole("dialog", { name: "What is wrong?" })).toBeInTheDocument();
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

  test("shows an explicit loading state until a compatible group loads", async () => {
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    expect(screen.getByTestId("library-sense-card-loading")).toBeInTheDocument();
    expect(
      await screen.findByTestId("library-sense-card-group"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("library-sense-card-loading")).not.toBeInTheDocument();
  });

  test.each([
    ["lookup_http_403", "You do not have access"],
    ["lookup_http_503", "temporarily unavailable"],
    ["contract-mismatch", "unsupported format"],
    ["platform_request_timeout", "too long to load"],
  ])("surfaces detail lookup failure %s", async (failure, expected) => {
    fetchGroup.mockRejectedValueOnce(new Error(failure));

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  test("retries a failed detail lookup and presents the recovered group", async () => {
    fetchGroup
      .mockRejectedValueOnce(new Error("lookup_http_503"))
      .mockResolvedValueOnce(multiSenseBankGroup);

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("library-sense-card-group")).toBeInTheDocument();
    expect(fetchGroup).toHaveBeenCalledTimes(2);
  });

  test("ignores detail lookup cancellation", async () => {
    fetchGroup.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
      />,
    );

    await waitFor(() => expect(fetchGroup).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    ).toContain("Loading details");
    expect(
      committedFrames.find(({ entryId }) => entryId === "entry-canal")?.text,
    ).toContain("Loading details");

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

  test("keeps same-headword steen meanings on their exact entry identity", async () => {
    const stoneObject = singleSenseGroup(
      "group-steen-object",
      "entry-steen-object",
      "steen",
      "a building stone",
    );
    const stoneMaterial = singleSenseGroup(
      "group-steen-material",
      "entry-steen-material",
      "steen",
      "stone as a material",
    );
    fetchGroup.mockImplementation(
      ({ entryId }: { entryId: string }) =>
        Promise.resolve(
          entryId === "entry-steen-object" ? stoneObject : stoneMaterial,
        ),
    );

    function SelectionHarness() {
      const [entryId, setEntryId] = React.useState("entry-steen-object");
      return (
        <>
          <button type="button" onClick={() => setEntryId("entry-steen-material")}>
            Select material steen
          </button>
          <LibrarySenseCardV2Session
            entryId={entryId}
            headword="steen"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    expect(await screen.findByText("a building stone")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select material steen" }));
    expect(await screen.findByText("stone as a material")).toBeInTheDocument();
    expect(screen.queryByText("a building stone")).not.toBeInTheDocument();
    expect(fetchGroup).toHaveBeenLastCalledWith(
      expect.objectContaining({ entryId: "entry-steen-material" }),
    );
  });

  test("opens the requested second meaning and copies that exact entry", async () => {
    const copyEntry = vi.fn().mockResolvedValue(undefined);
    fetchGroup.mockResolvedValue(multiSenseBankGroup);

    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onCopyToUserDictionary={copyEntry}
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    expect(
      screen.getByTestId(`library-sense-card-${financeEntry.entryId}`),
    ).toHaveAttribute("data-expanded", "true");
    expect(
      screen.getByTestId(`library-sense-card-${furnitureEntry.entryId}`),
    ).toHaveAttribute("data-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Copy to my dictionary" }));
    await waitFor(() => expect(copyEntry).toHaveBeenCalledWith(financeEntry.entryId));
  });

  test("activating a collapsed meaning with its chevron changes copy identity", async () => {
    const copyEntry = vi.fn().mockResolvedValue(undefined);
    fetchGroup.mockResolvedValue(multiSenseBankGroup);

    render(
      <LibrarySenseCardV2Session
        entryId={furnitureEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        onCopyToUserDictionary={copyEntry}
      />,
    );

    await screen.findByTestId("library-sense-card-group");
    const financeCard = screen.getByTestId(
      `library-sense-card-${financeEntry.entryId}`,
    );
    fireEvent.click(
      within(financeCard).getByRole("button", { name: "Expand meaning" }),
    );
    expect(financeCard).toHaveAttribute("data-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Copy to my dictionary" }));
    await waitFor(() => expect(copyEntry).toHaveBeenCalledWith(financeEntry.entryId));
  });

  test("brings the initially selected meaning into the internal scroll viewport", async () => {
    const rect = (top: number, bottom: number) =>
      ({
        top,
        bottom,
        left: 0,
        right: 320,
        width: 320,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === "library-sense-card-scroll-region") {
          return rect(0, 100);
        }
        if (this.dataset.entryId === financeEntry.entryId) {
          return rect(140, 190);
        }
        if (this.hasAttribute("data-meaning-lead") && this.closest("[data-entry-id]")?.getAttribute("data-entry-id") === financeEntry.entryId) {
          return rect(150, 180);
        }
        return rect(0, 0);
      });
    const heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.testid === "library-sense-card-scroll-region" ? 100 : 0;
      });

    try {
      fetchGroup.mockResolvedValue(multiSenseBankGroup);
      render(
        <LibrarySenseCardV2Session
          entryId={financeEntry.entryId}
          headword="bank"
          contentLanguageCode="nl"
          translationTargetLanguageCode="en"
          interfaceLanguage="en"
        />,
      );

      const scrollRegion = await screen.findByTestId(
        "library-sense-card-scroll-region",
      );
      await waitFor(() => expect(scrollRegion.scrollTop).toBe(115));
      expect(document.documentElement.scrollTop).toBe(0);
    } finally {
      rectSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  test("does not refresh the previous detail after an action races with navigation", async () => {
    const action = deferred<{
      contractVersion: "platform-action-v2";
      actionId: "start-learning";
      clientEventId: string;
      accepted: true;
      card: typeof financeEntry.card;
    }>();
    performAction.mockReturnValue(action.promise);
    fetchGroup.mockResolvedValue(multiSenseBankGroup);

    function SelectionHarness() {
      const [entryId, setEntryId] = React.useState(financeEntry.entryId);
      return (
        <>
          <button type="button" onClick={() => setEntryId(furnitureEntry.entryId)}>
            Select furniture meaning
          </button>
          <LibrarySenseCardV2Session
            entryId={entryId}
            headword="bank"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    await screen.findByText(financeEntry.contentNodes[0].text);
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    fireEvent.click(screen.getByRole("button", { name: "Select furniture meaning" }));
    await screen.findByText(furnitureEntry.contentNodes[0].text);
    expect(fetchGroup).toHaveBeenCalledTimes(2);

    action.resolve({
      contractVersion: "platform-action-v2",
      actionId: "start-learning",
      clientEventId: "event-race",
      accepted: true,
      card: financeEntry.card,
    });
    await act(async () => {
      await action.promise;
    });
    expect(fetchGroup).toHaveBeenCalledTimes(2);
  });

  test("keeps the newest action busy state when overlapping actions finish out of order", async () => {
    const actionA = deferred<unknown>();
    const actionB = deferred<unknown>();
    const groupA = singleSenseGroup(
      "group-action-a",
      "entry-action-a",
      "bank",
      "first action meaning",
    );
    const groupB = singleSenseGroup(
      "group-action-b",
      "entry-action-b",
      "bank",
      "second action meaning",
    );
    fetchGroup.mockImplementation(({ entryId }: { entryId: string }) =>
      Promise.resolve(entryId === "entry-action-a" ? groupA : groupB),
    );
    performAction
      .mockImplementationOnce(() => actionA.promise)
      .mockImplementationOnce(() => actionB.promise);

    function SelectionHarness() {
      const [entryId, setEntryId] = React.useState("entry-action-a");
      return (
        <>
          <button type="button" onClick={() => setEntryId("entry-action-b")}>
            Select second action meaning
          </button>
          <LibrarySenseCardV2Session
            entryId={entryId}
            headword="bank"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    await screen.findByText("first action meaning");
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Select second action meaning" }),
    );
    await screen.findByText("second action meaning");
    const learnButton = screen.getByRole("button", { name: "Learn" });
    fireEvent.click(learnButton);
    await waitFor(() => expect(learnButton).toBeDisabled());

    actionA.reject(new Error("stale action failed"));
    await act(async () => {
      await actionA.promise.catch(() => undefined);
    });
    expect(learnButton).toBeDisabled();
    expect(screen.queryByText("stale action failed")).not.toBeInTheDocument();

    actionB.resolve(undefined);
    await act(async () => {
      await actionB.promise;
    });
    await waitFor(() => expect(learnButton).not.toBeDisabled());
  });

  test("does not let an older membership response overwrite the current group", async () => {
    const membershipA = deferred<Map<string, EntryLearningListMembership[]>>();
    const membershipB = deferred<Map<string, EntryLearningListMembership[]>>();
    const groupA = singleSenseGroup(
      "group-membership-a",
      "entry-membership-a",
      "bank",
      "first membership meaning",
    );
    const groupB = singleSenseGroup(
      "group-membership-b",
      "entry-membership-b",
      "bank",
      "second membership meaning",
    );
    fetchGroup.mockImplementation(({ entryId }: { entryId: string }) =>
      Promise.resolve(entryId === "entry-membership-a" ? groupA : groupB),
    );
    fetchMemberships.mockImplementation((entryIds: string[]) =>
      entryIds.includes("entry-membership-b")
        ? membershipB.promise
        : membershipA.promise,
    );

    function SelectionHarness() {
      const [entryId, setEntryId] = React.useState("entry-membership-a");
      return (
        <>
          <button
            type="button"
            onClick={() => setEntryId("entry-membership-b")}
          >
            Select second membership meaning
          </button>
          <LibrarySenseCardV2Session
            entryId={entryId}
            headword="bank"
            contentLanguageCode="nl"
            translationTargetLanguageCode="en"
            interfaceLanguage="en"
            userId="user-membership"
          />
        </>
      );
    }

    render(<SelectionHarness />);
    await screen.findByText("first membership meaning");
    fireEvent.click(
      screen.getByRole("button", { name: "Select second membership meaning" }),
    );
    await screen.findByText("second membership meaning");
    await waitFor(() => expect(fetchMemberships).toHaveBeenCalledTimes(2));

    await act(async () => {
      membershipB.resolve(
        new Map([["entry-membership-b", [membership("list-b")]]]),
      );
      await membershipB.promise;
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Collections · 1" }),
      ).toBeInTheDocument(),
    );

    membershipA.resolve(
      new Map([["entry-membership-a", [membership("list-a")]]]),
    );
    await act(async () => {
      await membershipA.promise;
    });
    expect(
      screen.getByRole("button", { name: "Collections · 1" }),
    ).toBeInTheDocument();
  });

  test("does not refresh an old lookup dimension after translation changes", async () => {
    const action = deferred<unknown>();
    const lookupCalls: Array<{ translationTargetLanguageCode: string | null }> =
      [];
    performAction.mockReturnValue(action.promise);
    fetchGroup.mockImplementation(
      (input: { translationTargetLanguageCode: string | null }) => {
        lookupCalls.push({
          translationTargetLanguageCode: input.translationTargetLanguageCode,
        });
        return Promise.resolve(multiSenseBankGroup);
      },
    );

    function TranslationHarness() {
      const [translation, setTranslation] = React.useState<string | null>("en");
      return (
        <>
          <button type="button" onClick={() => setTranslation("ru")}>
            Change translation language
          </button>
          <LibrarySenseCardV2Session
            entryId={financeEntry.entryId}
            headword="bank"
            contentLanguageCode="nl"
            translationTargetLanguageCode={translation}
            interfaceLanguage="en"
          />
        </>
      );
    }

    render(<TranslationHarness />);
    await screen.findByText(financeEntry.contentNodes[0].text);
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Change translation language" }),
    );
    await waitFor(() =>
      expect(lookupCalls).toEqual([
        { translationTargetLanguageCode: "en" },
        { translationTargetLanguageCode: "ru" },
      ]),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Learn" })).not.toBeDisabled(),
    );

    action.resolve(undefined);
    await act(async () => {
      await action.promise;
    });
    expect(lookupCalls).toEqual([
      { translationTargetLanguageCode: "en" },
      { translationTargetLanguageCode: "ru" },
    ]);
  });

  test("follows a pointer in a corpus-shaped mixed group to the real target content", async () => {
    const mixedDaarGroup: PlatformHeadwordGroupV2 = {
      ...multiSenseBankGroup,
      header: { ...multiSenseBankGroup.header, text: "daar" },
      senseCount: 1,
      entryCount: 2,
      entries: [
        {
          ...financeEntry,
          entryId: "entry-daar-1",
          meaningOrdinal: 1,
        },
        {
          kind: "cross-reference",
          crossReferenceId: "entry-daar-2",
          meaningOrdinal: 2,
          label: {
            termId: "cross-reference.see",
            messageKey: "crossReference.see",
          },
          text: "daar-",
          target: {
            query: "daar-",
            headwordGroupId: "group-daar-target",
            entryId: "entry-daar-target",
          },
          capabilities: [
            {
              actionId: "follow-cross-reference",
              elementId: "cross-reference.follow",
              messageKey: "crossReference.follow",
            },
          ],
        },
      ],
    };
    fetchGroup.mockResolvedValue(mixedDaarGroup);
    fetchCrossReferenceTarget.mockResolvedValue({
      ...multiSenseBankGroup,
      header: { ...multiSenseBankGroup.header, text: "daar-" },
      entries: [
        { ...financeEntry, entryId: "entry-daar-target" },
        furnitureEntry,
      ],
    });
    const copyEntry = vi.fn().mockResolvedValue(undefined);

    render(
      <LibrarySenseCardV2Session
        entryId="entry-daar-2"
        headword="daar"
        contentLanguageCode="nl"
        translationTargetLanguageCode="en"
        interfaceLanguage="en"
        initialGroup={mixedDaarGroup}
        onCopyToUserDictionary={copyEntry}
      />,
    );

    expect(await screen.findByText("daar-")).toBeInTheDocument();
    const pointer = screen.getByTestId("library-cross-reference-entry-daar-2");
    const meaning = screen.getByTestId("library-sense-card-entry-daar-1");
    expect(
      meaning.compareDocumentPosition(pointer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(meaning).getByText("1")).toBeInTheDocument();
    expect(within(pointer).getByText("2")).toBeInTheDocument();
    expect(
      within(pointer).queryByRole("button", { name: "Learn" }),
    ).not.toBeInTheDocument();
    expect(
      within(pointer).queryByRole("button", { name: "Mark known" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy to my dictionary" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open reference" }));

    await waitFor(() =>
      expect(fetchCrossReferenceTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "daar-",
          sourceDictionaryId: "vandale",
          targetHeadwordGroupId: "group-daar-target",
          targetEntryId: "entry-daar-target",
        }),
      ),
    );
    expect(
      await screen.findByText(
        "een bedrijf dat jouw geld bewaart of waar je geld kunt lenen",
      ),
    ).toBeInTheDocument();
    const targetCard = screen.getByTestId("library-sense-card-entry-daar-target");
    const alternateCard = screen.getByTestId(
      `library-sense-card-${furnitureEntry.entryId}`,
    );
    expect(targetCard).toHaveAttribute("data-expanded", "true");
    fireEvent.click(alternateCard);
    expect(alternateCard).toHaveAttribute("data-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Copy to my dictionary" }));
    await waitFor(() =>
      expect(copyEntry).toHaveBeenCalledWith(furnitureEntry.entryId),
    );
  });

  test("normalizes the translation-off sentinel before lookup", async () => {
    render(
      <LibrarySenseCardV2Session
        entryId={financeEntry.entryId}
        headword="bank"
        contentLanguageCode="nl"
        translationTargetLanguageCode="off"
        interfaceLanguage="en"
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
