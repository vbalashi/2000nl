import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@supabase/supabase-js";
import { beforeEach, expect, test, vi } from "vitest";

// Next injects the JSX runtime for app routes; Vitest compiles this route with
// the classic runtime in isolation.
Object.assign(globalThis, { React });

type SessionResult = {
  data: { session: { user: User } | null };
};

let resolveSession: (result: SessionResult) => void;

const getSession = vi.fn(
  () =>
    new Promise<SessionResult>((resolve) => {
      resolveSession = resolve;
    }),
);
const unsubscribe = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe } },
      })),
    },
  },
}));

vi.mock("@/lib/training/trainingTransitionTiming", () => ({
  createTrainingTransitionId: () => "transition-startup",
  measureTrainingTransitionStage: async (
    _transitionId: string,
    _stage: string,
    operation: () => Promise<SessionResult>,
  ) => operation(),
}));

vi.mock("@/components/navigation/TrainingLibraryShell", () => ({
  TrainingLibraryShell: () => (
    <div data-testid="authenticated-training-shell">
      <h1>Training laden</h1>
      <p role="status">…</p>
    </div>
  ),
}));

vi.mock("@/components/auth/AuthScreen", () => ({
  AuthScreen: () => <div>Auth</div>,
}));

vi.mock("@/components/DevDatabaseWarning", () => ({
  DevDatabaseWarning: () => null,
}));

const { default: HomePage } = await import("@/app/page");

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem("onboarding_language", "nl");
});

test.each([
  [
    "en",
    "Loading Training",
    "We’re checking your session before Training opens.",
    "This is taking longer than usual. We’re still trying.",
  ],
  [
    "nl",
    "Training laden",
    "We controleren je sessie voordat Training opent.",
    "Dit duurt langer dan normaal. We blijven proberen.",
  ],
  [
    "ru",
    "Загрузка тренировки",
    "Проверяем ваш сеанс перед открытием тренировки.",
    "Это занимает больше времени, чем обычно. Мы продолжаем попытки.",
  ],
] as const)(
  "bootstrap loading stays in the localized %s Training shell",
  (language, heading, body, longRunningBody) => {
    vi.useFakeTimers();
    window.localStorage.setItem("onboarding_language", language);

    try {
      render(<HomePage />);

      expect(screen.getByTestId("training-bootstrap-shell")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: heading }).closest("section"))
        .toHaveAttribute("aria-busy", "true");
      expect(screen.queryByText("Laden…")).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(8_000));
      expect(screen.getByText(longRunningBody)).toBeInTheDocument();
      expect(screen.queryByText(body)).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: heading }).closest("section"))
        .toHaveAttribute("aria-busy", "true");
    } finally {
      vi.useRealTimers();
    }
  },
);

test("auth and Training bootstrap expose one localized in-shell loading progression", async () => {
  const labels: string[] = [];
  const observer = new MutationObserver(() => {
    for (const label of ["Laden…", "Training laden"]) {
      if (document.body.textContent?.includes(label) && !labels.includes(label)) {
        labels.push(label);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  render(<HomePage />);

  expect(
    screen.getByRole("heading", { name: "Training laden" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Laden…")).not.toBeInTheDocument();

  await act(async () => {
    resolveSession({
      data: {
        session: {
          user: { id: "user-1", email: "test@2000nl.test" } as User,
        },
      },
    });
  });

  expect(screen.getByTestId("authenticated-training-shell")).toBeInTheDocument();
  expect(labels).toEqual(["Training laden"]);
  observer.disconnect();
});

test("auth failure stays in the shell and retry resolves the destination", async () => {
  const interaction = userEvent.setup();
  getSession.mockRejectedValueOnce(new Error("temporary auth failure"));

  render(<HomePage />);

  expect(
    await screen.findByRole("heading", {
      name: "Sessie kon niet worden gecontroleerd",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "We konden je sessie niet controleren. Probeer het opnieuw.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByTestId("training-bootstrap-shell")).toBeInTheDocument();

  await interaction.tab();
  expect(screen.getByRole("button", { name: "Opnieuw proberen" }))
    .toHaveFocus();

  await act(async () => {
    screen.getByRole("button", { name: "Opnieuw proberen" }).click();
  });
  expect(
    screen.getByRole("heading", { name: "Training laden" }),
  ).toBeInTheDocument();

  await act(async () => {
    resolveSession({
      data: {
        session: {
          user: { id: "user-1", email: "test@2000nl.test" } as User,
        },
      },
    });
  });

  expect(screen.getByTestId("authenticated-training-shell")).toBeInTheDocument();
});
