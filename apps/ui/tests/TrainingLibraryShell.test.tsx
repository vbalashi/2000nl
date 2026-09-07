import React, { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, expect, test, vi } from "vitest";

let trainingMounts = 0;

vi.mock("@/components/training/TrainingScreen", () => ({
  TrainingScreen: ({
    destination,
    onRequestDestination,
    onReturnFromHistory,
    onNavigationBlockedChange,
  }: {
    destination?:
      "training" | "library" | "statistics" | "settings" | "history";
    onRequestDestination?: (
      destination:
        "training" | "library" | "statistics" | "settings" | "history",
    ) => void;
    onReturnFromHistory?: () => void;
    onNavigationBlockedChange?: (blocked: boolean) => void;
  }) => {
    const mountNumber = useRef<number>();
    if (!mountNumber.current) {
      trainingMounts += 1;
      mountNumber.current = trainingMounts;
    }

    return (
      <div>
        <p>training mount {mountNumber.current}</p>
        <p>destination {destination ?? "legacy"}</p>
        <button onClick={() => onRequestDestination?.("library")}>
          Library
        </button>
        <button onClick={() => onRequestDestination?.("statistics")}>
          Statistics
        </button>
        <button onClick={() => onRequestDestination?.("settings")}>
          Settings
        </button>
        <button onClick={() => onRequestDestination?.("history")}>
          History
        </button>
        <button onClick={() => onReturnFromHistory?.()}>
          Return from History
        </button>
        <button onClick={() => onNavigationBlockedChange?.(true)}>Block</button>
      </div>
    );
  },
}));

const { TrainingLibraryShell: ProductionTrainingLibraryShell } =
  await import("@/components/navigation/TrainingLibraryShell");

const defaultStartupSnapshot = {
  transitionId: "test-startup",
  interfaceLanguage: "en" as const,
  preferences: {
    themePreference: "system" as const,
    audioQuality: "free" as const,
    modesEnabled: ["word-to-definition" as const],
    cardFilter: "both" as const,
    languageCode: "nl",
    newReviewRatio: 2,
    activeScenario: "understanding",
    translationLang: "ru",
    preferences: { onboardingLanguage: "en" as const },
  },
};

function TrainingLibraryShell(
  props: Omit<
    React.ComponentProps<typeof ProductionTrainingLibraryShell>,
    "startupSnapshot"
  >,
) {
  return (
    <ProductionTrainingLibraryShell
      {...props}
      startupSnapshot={defaultStartupSnapshot}
    />
  );
}

const user = { id: "user-1", email: "user@test.com" } as User;

beforeEach(() => {
  trainingMounts = 0;
  window.history.replaceState({}, "", "/");
});

test("Training and Library share one mounted Training session across history navigation", () => {
  render(<TrainingLibraryShell user={user} />);

  expect(screen.getByText("training mount 1")).toBeInTheDocument();
  expect(screen.getByText("destination training")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Library" }));

  expect(window.location.search).toBe("?destination=library");
  expect(screen.getByText("destination library")).toBeInTheDocument();
  expect(screen.getByText("training mount 1")).toBeInTheDocument();

  act(() => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  expect(screen.getByText("destination training")).toBeInTheDocument();
  expect(screen.getByText("training mount 1")).toBeInTheDocument();
  expect(trainingMounts).toBe(1);
});

test("pending review blocks both deliberate and history destination changes", () => {
  render(<TrainingLibraryShell user={user} />);

  fireEvent.click(screen.getByRole("button", { name: "Block" }));
  fireEvent.click(screen.getByRole("button", { name: "Library" }));

  expect(window.location.search).toBe("");
  expect(screen.getByText("destination training")).toBeInTheDocument();

  act(() => {
    window.history.pushState({}, "", "/?destination=library");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  expect(window.location.search).toBe("");
  expect(screen.getByText("destination training")).toBeInTheDocument();
});

test("a blocked browser Back is reversed without overwriting the previous entry", () => {
  render(<TrainingLibraryShell user={user} />);
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  expect(screen.getByText("destination library")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Block" }));
  const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);

  act(() => {
    window.history.replaceState(
      { __2000nlAppPosition: 0, original: "keep-me" },
      "",
      "/",
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { __2000nlAppPosition: 0, original: "keep-me" },
      }),
    );
  });

  expect(go).toHaveBeenCalledWith(1);
  expect(window.history.state.original).toBe("keep-me");
  expect(screen.getByText("destination library")).toBeInTheDocument();
  go.mockRestore();
});

test("a blocked unknown entry cannot change the URL while keeping the same parsed destination", () => {
  render(<TrainingLibraryShell user={user} />);
  fireEvent.click(screen.getByRole("button", { name: "Block" }));

  act(() => {
    window.history.replaceState(
      { external: "keep-me" },
      "",
      "/outside?source=external",
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { external: "keep-me" } }),
    );
  });

  expect(window.location.pathname).toBe("/");
  expect(window.location.search).toBe("");
  expect(screen.getByText("destination training")).toBeInTheDocument();
});

test("all destinations share the mounted Training session and browser history", () => {
  render(<TrainingLibraryShell user={user} />);

  fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
  expect(window.location.search).toBe("?destination=statistics");
  expect(screen.getByText("destination statistics")).toBeInTheDocument();
  expect(screen.getByText("training mount 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(window.location.search).toBe("?destination=settings");
  expect(screen.getByText("destination settings")).toBeInTheDocument();

  act(() => {
    window.history.pushState({}, "", "/?destination=statistics");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByText("destination statistics")).toBeInTheDocument();
  expect(trainingMounts).toBe(1);
});

test("a direct Statistics URL survives shell hydration", () => {
  window.history.replaceState({}, "", "/?destination=statistics");

  render(<TrainingLibraryShell user={user} />);

  expect(screen.getByText("destination statistics")).toBeInTheDocument();
  expect(window.location.search).toBe("?destination=statistics");
});

test("Training history is a secondary destination in the common shell", () => {
  render(<TrainingLibraryShell user={user} />);

  fireEvent.click(screen.getByRole("button", { name: "History" }));

  expect(window.location.search).toBe("?destination=history");
  expect(screen.getByText("destination history")).toBeInTheDocument();
  expect(screen.getByText("training mount 1")).toBeInTheDocument();

  act(() => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  expect(screen.getByText("destination training")).toBeInTheDocument();
  expect(trainingMounts).toBe(1);
});

test("a direct Training history URL survives shell hydration", () => {
  window.history.replaceState({}, "", "/?destination=history");

  render(<TrainingLibraryShell user={user} />);

  expect(screen.getByText("destination history")).toBeInTheDocument();
  expect(window.location.search).toBe("?destination=history");
});

test("returning from History replaces its entry so Back cannot loop into History", async () => {
  window.history.replaceState(
    { origin: "before-training" },
    "",
    "/?origin=before",
  );
  window.history.pushState({}, "", "/");
  render(<TrainingLibraryShell user={user} />);

  fireEvent.click(screen.getByRole("button", { name: "History" }));
  expect(window.location.search).toBe("?destination=history");

  fireEvent.click(screen.getByRole("button", { name: "Return from History" }));
  expect(window.location.search).toBe("");
  expect(screen.getByText("destination training")).toBeInTheDocument();

  await act(async () => {
    await new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
      window.history.back();
    });
  });
  expect(window.location.search).not.toBe("?destination=history");
});
