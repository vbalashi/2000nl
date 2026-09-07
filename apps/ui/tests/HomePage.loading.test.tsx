import React from "react";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
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
const fetchUserPreferences = vi.fn();

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

vi.mock("@/lib/trainingService", () => ({
  fetchUserPreferences,
}));

vi.mock("@/lib/training/trainingTransitionTiming", () => ({
  createTrainingTransitionId: () => "transition-startup",
  recordTrainingTransitionTiming: vi.fn(),
  measureTrainingTransitionStage: async (
    _transitionId: string,
    _stage: string,
    operation: () => Promise<SessionResult>,
  ) => operation(),
}));

vi.mock("@/components/navigation/TrainingLibraryShell", () => ({
  TrainingLibraryShell: ({
    initialInterfaceLanguage,
  }: {
    initialInterfaceLanguage: "en" | "nl" | "ru";
  }) => {
    const heading = {
      en: "Loading Training",
      nl: "Training laden",
      ru: "Загрузка тренировки",
    }[initialInterfaceLanguage];
    return (
      <div
        data-testid="authenticated-training-shell"
        data-interface-language={initialInterfaceLanguage}
      >
        <h1>{heading}</h1>
        <p role="status">…</p>
      </div>
    );
  },
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
  fetchUserPreferences.mockResolvedValue({
    themePreference: "system",
    audioQuality: "free",
    modesEnabled: ["word-to-definition"],
    cardFilter: "both",
    languageCode: "nl",
    newReviewRatio: 2,
    activeScenario: "understanding",
    translationLang: "ru",
    preferences: { onboardingLanguage: "nl" },
  });
});

test("server bootstrap does not invent an English language before browser state is read", () => {
  const html = renderToString(<HomePage />);

  expect(html).toContain("training-loading-indicator");
  expect(html).not.toContain("Preparing training");
  expect(html).not.toContain("Loading Training");
});

test("uses the account language without an English waiting screen on a new browser", async () => {
  window.localStorage.clear();
  fetchUserPreferences.mockResolvedValueOnce({
    themePreference: "system",
    audioQuality: "free",
    modesEnabled: ["word-to-definition"],
    cardFilter: "both",
    languageCode: "nl",
    newReviewRatio: 2,
    activeScenario: "understanding",
    translationLang: "ru",
    preferences: { onboardingLanguage: "ru" },
  });

  render(<HomePage />);

  expect(screen.getByTestId("training-loading-indicator")).toBeInTheDocument();
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();

  await act(async () => {
    resolveSession({
      data: {
        session: {
          user: { id: "user-1", email: "test@2000nl.test" } as User,
        },
      },
    });
  });

  expect(screen.getByTestId("authenticated-training-shell")).toHaveAttribute(
    "data-interface-language",
    "ru",
  );
  expect(
    screen.queryByRole("heading", { name: "Loading Training" }),
  ).not.toBeInTheDocument();
});

test.each([
  [
    "en",
    "Preparing training",
    "Still preparing your training",
    "This is taking a little longer than expected.",
  ],
  [
    "nl",
    "Training voorbereiden",
    "Training wordt nog voorbereid",
    "Dit duurt iets langer dan verwacht.",
  ],
  [
    "ru",
    "Подготавливаем тренировку",
    "Тренировка всё ещё подготавливается",
    "Это занимает немного больше времени, чем ожидалось.",
  ],
] as const)(
  "bootstrap loading stays in the localized %s Training shell",
  (language, heading, longRunningHeading, longRunningBody) => {
    vi.useFakeTimers();
    window.localStorage.setItem("onboarding_language", language);

    try {
      render(<HomePage />);

      expect(screen.getByTestId("training-bootstrap-shell")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: heading }).closest("section"))
        .toHaveAttribute("aria-busy", "true");
      expect(screen.queryByText("Laden…")).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(8_000));
      expect(
        screen.getByRole("heading", { name: longRunningHeading }),
      ).toBeInTheDocument();
      expect(screen.getByText(longRunningBody)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: heading })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: longRunningHeading }).closest("section"))
        .toHaveAttribute("aria-busy", "true");
    } finally {
      vi.useRealTimers();
    }
  },
);

test("keeps the saved language visible while account preferences are delayed", async () => {
  window.localStorage.setItem("onboarding_language", "ru");
  let resolvePreferences!: (value: Record<string, unknown>) => void;
  fetchUserPreferences.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePreferences = resolve;
      }),
  );

  render(<HomePage />);
  expect(
    screen.getByRole("heading", {
      name: "Подготавливаем тренировку",
    }),
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

  expect(screen.getByTestId("training-bootstrap-shell")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", {
      name: "Подготавливаем тренировку",
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Loading Training" }),
  ).not.toBeInTheDocument();

  await act(async () => {
    resolvePreferences({
      themePreference: "system",
      audioQuality: "free",
      modesEnabled: ["word-to-definition"],
      cardFilter: "both",
      languageCode: "nl",
      newReviewRatio: 2,
      activeScenario: "understanding",
      translationLang: "ru",
      preferences: { onboardingLanguage: "en" },
    });
  });

  expect(screen.getByTestId("authenticated-training-shell")).toHaveAttribute(
    "data-interface-language",
    "ru",
  );
});

test("auth and Training bootstrap expose one localized in-shell loading progression", async () => {
  const labels: string[] = [];
  const observer = new MutationObserver(() => {
    for (const label of ["Laden…", "Training voorbereiden"]) {
      if (document.body.textContent?.includes(label) && !labels.includes(label)) {
        labels.push(label);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  render(<HomePage />);

  expect(
    screen.getByRole("heading", { name: "Training voorbereiden" }),
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
  expect(screen.getByTestId("authenticated-training-shell")).toHaveAttribute(
    "data-interface-language",
    "nl",
  );
  expect(labels).toEqual(["Training voorbereiden"]);
  observer.disconnect();
});

test.each([
  ["en", "Preparing training", "Loading Training"],
  ["nl", "Training voorbereiden", "Training laden"],
  [
    "ru",
    "Подготавливаем тренировку",
    "Загрузка тренировки",
  ],
] as const)(
  "hands saved %s to authenticated Training without an English fallback",
  async (language, bootstrapHeading, authenticatedHeading) => {
    window.localStorage.setItem("onboarding_language", language);
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: bootstrapHeading }),
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

    const authenticatedShell = screen.getByTestId(
      "authenticated-training-shell",
    );
    expect(authenticatedShell).toHaveAttribute(
      "data-interface-language",
      language,
    );
    expect(
      screen.getByRole("heading", { name: authenticatedHeading }),
    ).toBeInTheDocument();
    if (language !== "en") {
      expect(
        screen.queryByRole("heading", { name: "Loading Training" }),
      ).not.toBeInTheDocument();
    }
  },
);

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
    screen.getByRole("heading", { name: "Training voorbereiden" }),
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
