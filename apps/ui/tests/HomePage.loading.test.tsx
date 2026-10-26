import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
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

const shellInvitations:Array<{userId:string;code:string|null}>=[];
let resolveSession: (result: SessionResult) => void;
let authStateHandler: (
  event: string,
  session: SessionResult["data"]["session"],
) => void;

const getSession = vi.fn(
  () =>
    new Promise<SessionResult>((resolve) => {
      resolveSession = resolve;
    }),
);
const unsubscribe = vi.fn();
const fetchUserPreferences = vi.fn();
vi.mock("@/lib/admission/client", () => ({ requestAdmission: vi.fn().mockResolvedValue({ enabled: false, status: "approved", mode: "open" }) }));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession,
      onAuthStateChange: vi.fn((handler) => {
        authStateHandler = handler;
        return { data: { subscription: { unsubscribe } } };
      }),
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
    startupSnapshot,invitationCode,user,
  }: {
    invitationCode?:string|null;user:User;
    startupSnapshot: {
      transitionId: string;
      interfaceLanguage: "en" | "nl" | "ru";
    };
  }) => {
    shellInvitations.push({userId:user.id,code:invitationCode??null});
    const { interfaceLanguage, transitionId } = startupSnapshot;
    const heading = {
      en: "Loading Training",
      nl: "Training laden",
      ru: "Загрузка тренировки",
    }[interfaceLanguage];
    return (
      <div
        data-testid="authenticated-training-shell"
        data-user-id={user.id}
        data-invitation-code={invitationCode??''}
        data-interface-language={interfaceLanguage}
        data-transition-id={transitionId}
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
const {default:InvitationHomePage}=await import("@/app/HomePage");

beforeEach(() => {
  window.sessionStorage.clear();shellInvitations.length=0;
  vi.clearAllMocks();
  getSession.mockReset();
  getSession.mockImplementation(
    () =>
      new Promise<SessionResult>((resolve) => {
        resolveSession = resolve;
      }),
  );
  fetchUserPreferences.mockReset();
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

  expect(html).toContain("training-bootstrap-shell");
  expect(html).toContain('aria-label="Preparing training"');
  expect(html).not.toContain("Loading Training");
});

test("does not restart bootstrap for Supabase's initial subscription event", () => {
  render(<HomePage />);

  expect(getSession).toHaveBeenCalledTimes(1);
  act(() => authStateHandler("INITIAL_SESSION", null));
  expect(getSession).toHaveBeenCalledTimes(1);
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

  expect(screen.getByTestId("training-bootstrap-shell")).toBeInTheDocument();
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
  ["en", "Preparing training"],
  ["nl", "Training voorbereiden"],
  ["ru", "Подготавливаем тренировку"],
] as const)(
  "bootstrap loading stays in the localized %s startup shell",
  (language, heading) => {
    window.localStorage.setItem("onboarding_language", language);

    render(<HomePage />);

    expect(screen.getByTestId("training-bootstrap-shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading }).closest("section"))
      .toHaveAttribute("aria-busy", "true");
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
    "en",
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
    fetchUserPreferences.mockResolvedValueOnce({
      themePreference: "system",
      audioQuality: "free",
      modesEnabled: ["word-to-definition"],
      cardFilter: "both",
      languageCode: "nl",
      newReviewRatio: 2,
      activeScenario: "understanding",
      translationLang: "ru",
      preferences: { onboardingLanguage: language },
    });
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

test("discards an authenticated bootstrap that finishes after sign-out", async () => {
  let resolvePreferences!: (value: Record<string, unknown>) => void;
  fetchUserPreferences.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePreferences = resolve;
      }),
  );

  render(<HomePage />);
  await act(async () => {
    resolveSession({
      data: {
        session: {
          user: { id: "user-1", email: "test@2000nl.test" } as User,
        },
      },
    });
  });
  expect(fetchUserPreferences).toHaveBeenCalledWith("user-1");

  act(() => authStateHandler("SIGNED_OUT", null));
  await act(async () => {
    resolveSession({ data: { session: null } });
  });
  expect(await screen.findByText("Auth")).toBeInTheDocument();

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
      preferences: { onboardingLanguage: "ru" },
    });
  });

  expect(screen.getByText("Auth")).toBeInTheDocument();
  expect(
    screen.queryByTestId("authenticated-training-shell"),
  ).not.toBeInTheDocument();
});

test("signed-out auth event unmounts the authenticated Training shell", async () => {
  render(<HomePage />);

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

  act(() => authStateHandler("SIGNED_OUT", null));
  expect(getSession).toHaveBeenCalledTimes(2);

  await act(async () => {
    resolveSession({ data: { session: null } });
  });

  expect(await screen.findByText("Auth")).toBeInTheDocument();
  expect(screen.queryByTestId("authenticated-training-shell")).not.toBeInTheDocument();
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


test("pending account does not bootstrap preferences or mount training", async () => {
 const { requestAdmission } = await import("@/lib/admission/client");
 vi.mocked(requestAdmission).mockResolvedValueOnce({ enabled: true, status: "pending", mode: "approval-required" });
 render(<HomePage />);
 await act(async () => { resolveSession({ data: { session: { user: { id: "pending-user" } as User } } }); });
 expect(screen.getByRole("heading").textContent).toContain("wacht op goedkeuring");
 expect(fetchUserPreferences).not.toHaveBeenCalled();
});

test('account A recovery and pre-auth intake never reach account B shell',async()=>{
 vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_ENABLED','true');const code='A'.repeat(26);
 try{
  window.sessionStorage.setItem('2000nl.pending-share-accept.v1.user-1',JSON.stringify({userId:'user-1',command:{operationId:'75600000-0000-4000-8000-000000000001',action:'accept',code}}));
  window.sessionStorage.setItem('2000nl.pending-share-invitation.v1',JSON.stringify({code,capturedAt:Date.now()}));
  render(<HomePage/>);
  await act(async()=>{resolveSession({data:{session:{user:{id:'user-1'} as User}}});});
  expect(screen.getByTestId('authenticated-training-shell')).toHaveAttribute('data-invitation-code',code);
  expect(window.sessionStorage.getItem('2000nl.pending-share-invitation.v1')).toBeNull();
  act(()=>authStateHandler('SIGNED_IN',{user:{id:'user-2'} as User}));
  await act(async()=>{resolveSession({data:{session:{user:{id:'user-2'} as User}}});});
  expect(screen.getByTestId('authenticated-training-shell')).toHaveAttribute('data-user-id','user-2');
  expect(shellInvitations.filter(value=>value.userId==='user-2').every(value=>value.code===null)).toBe(true);
  expect(window.sessionStorage.getItem('2000nl.pending-share-accept.v1.user-1')).toContain(code);
 }finally{vi.unstubAllEnvs();}
});

test.each([undefined,null,'B'.repeat(26)])('account-bound preview reload respects explicit intake %s',async invitationCode=>{
 vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_ENABLED','true');const code='A'.repeat(26);
 try{
  window.sessionStorage.setItem('2000nl.pending-share-preview.v1.user-1',JSON.stringify({code,capturedAt:Date.now()}));
  render(<InvitationHomePage invitationCode={invitationCode}/>);
  await act(async()=>{resolveSession({data:{session:{user:{id:'user-1'} as User}}});});
  await waitFor(()=>expect(screen.getByTestId('authenticated-training-shell')).toHaveAttribute('data-invitation-code',invitationCode===undefined?code:invitationCode??''));
  if(invitationCode===null)expect(window.sessionStorage.getItem('2000nl.pending-share-preview.v1.user-1')).toBeNull();
 }finally{vi.unstubAllEnvs();}
});


test("pending admission preserves sharing intake and resumes only after explicit approval", async () => {
 vi.stubEnv("NEXT_PUBLIC_COLLECTION_SHARING_ENABLED", "true");
 const { requestAdmission } = await import("@/lib/admission/client");
 const code = "C".repeat(26);
 vi.mocked(requestAdmission).mockResolvedValueOnce({ enabled: true, status: "pending", mode: "approval-required" });
 try {
  render(<InvitationHomePage invitationCode={code} />);
  await act(async () => { resolveSession({ data: { session: { user: { id: "pending-share-user" } as User } } }); });
  expect(fetchUserPreferences).not.toHaveBeenCalled();
  expect(screen.queryByTestId("authenticated-training-shell")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Toegang controleren" }));
  await act(async () => { resolveSession({ data: { session: { user: { id: "pending-share-user" } as User } } }); });
  await waitFor(() => expect(screen.getByTestId("authenticated-training-shell")).toHaveAttribute("data-invitation-code", code));
  expect(fetchUserPreferences).toHaveBeenCalledTimes(1);
 } finally { vi.unstubAllEnvs(); }
});
