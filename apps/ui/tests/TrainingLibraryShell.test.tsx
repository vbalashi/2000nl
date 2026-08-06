import React, { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, expect, test, vi } from "vitest";

let trainingMounts = 0;

vi.mock("@/components/training/TrainingScreen", () => ({
  TrainingScreen: ({
    destination,
    onRequestDestination,
    onNavigationBlockedChange,
  }: {
    destination?: "training" | "library" | "statistics" | "settings";
    onRequestDestination?: (
      destination: "training" | "library" | "statistics" | "settings",
    ) => void;
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
        <button onClick={() => onRequestDestination?.("library")}>Library</button>
        <button onClick={() => onRequestDestination?.("statistics")}>
          Statistics
        </button>
        <button onClick={() => onRequestDestination?.("settings")}>
          Settings
        </button>
        <button onClick={() => onNavigationBlockedChange?.(true)}>Block</button>
      </div>
    );
  },
}));

const { TrainingLibraryShell } = await import(
  "@/components/navigation/TrainingLibraryShell"
);

const user = { id: "user-1", email: "user@test.com" } as User;

beforeEach(() => {
  trainingMounts = 0;
  window.history.replaceState({}, "", "/");
});

test("Training and Library share one mounted Training session across history navigation", () => {
  render(<TrainingLibraryShell user={user} enabled />);

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
  render(<TrainingLibraryShell user={user} enabled />);

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

test("disabled rollout preserves the legacy Training entry point", () => {
  window.history.replaceState({}, "", "/?destination=library");

  render(<TrainingLibraryShell user={user} enabled={false} />);

  expect(screen.getByText("destination legacy")).toBeInTheDocument();
  expect(window.location.search).toBe("?destination=library");
});

test("extended destinations share the mounted Training session and browser history", () => {
  render(
    <TrainingLibraryShell
      user={user}
      enabled
      extendedDestinationsEnabled
    />,
  );

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

test("extended destination flag off normalizes unsupported direct links to Training", () => {
  window.history.replaceState({}, "", "/?destination=statistics");

  render(
    <TrainingLibraryShell
      user={user}
      enabled
      extendedDestinationsEnabled={false}
    />,
  );

  expect(screen.getByText("destination training")).toBeInTheDocument();
  expect(window.location.search).toBe("");
});
