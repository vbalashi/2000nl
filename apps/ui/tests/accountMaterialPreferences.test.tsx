import React from "react";
import {
  afterEach,
  beforeEach,
  beforeAll,
  afterAll,
  expect,
  test,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  AccountMaterialProvider,
  useAccountMaterial,
  type MaterialRepository,
} from "@/components/practice/material/AccountMaterialProvider";
import {
  LearningMaterialSettings,
  DictionaryMaterialSettings,
} from "@/components/practice/material/MaterialSettings";
import {
  emptyMaterialPreferences,
  type MaterialPreferencesSnapshot,
} from "@/lib/training/material/model";
import { getUiMessages } from "@/lib/uiMessages";
const { dictionaries } = vi.hoisted(() => ({ dictionaries: vi.fn() }));
vi.mock("@/lib/training/listService", () => ({
  fetchAvailableDictionarySourcesStrict: dictionaries,
  fetchAvailableLearningLanguages: vi.fn(),
}));
const catalog = [
  {
    code: "nl",
    label: "Dutch",
    dictionaryCount: 1,
    curatedListCount: 1,
    userListCount: 0,
    hasTrainingEligibleLists: true,
  },
  {
    code: "en",
    label: "English",
    dictionaryCount: 0,
    curatedListCount: 0,
    userListCount: 0,
    hasTrainingEligibleLists: false,
  },
];
function repository(snapshot = emptyMaterialPreferences()): MaterialRepository {
  return {
    load: vi.fn().mockResolvedValue(snapshot),
    languages: vi.fn().mockResolvedValue(catalog),
    save: vi.fn(async (_, revision, document) => ({
      kind: "saved" as const,
      snapshot: { revision: revision + 1, document },
    })),
  };
}
function State() {
  const account = useAccountMaterial();
  return (
    <output data-testid="state">
      {JSON.stringify(account?.snapshot ?? null)}
    </output>
  );
}
function view(
  repo: MaterialRepository,
  userId = "account-a",
  language: "en" | "nl" | "ru" = "en",
  dicts = false,
) {
  return (
    <AccountMaterialProvider userId={userId} repository={repo}>
      {dicts ? (
        <DictionaryMaterialSettings language={language} />
      ) : (
        <LearningMaterialSettings language={language} />
      )}
      <State />
    </AccountMaterialProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  dictionaries.mockResolvedValue([]);
});
test("flag-off does not read material or expose new controls", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "false");
  const repo = repository();
  render(view(repo));
  expect(repo.load).not.toHaveBeenCalled();
  expect(screen.queryByRole("switch")).toBeNull();
});
test("loads implicit readable languages and saves pause as canonical codes without optimistic state", async () => {
  const repo = repository();
  let finish!: (
    result: Awaited<ReturnType<MaterialRepository["save"]>>,
  ) => void;
  repo.save = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(view(repo));
  const english = await screen.findByRole("switch", { name: "Study English" });
  english.focus();
  fireEvent.click(english);
  fireEvent.click(english);
  expect(english).toHaveFocus();
  expect(repo.save).toHaveBeenCalledOnce();
  expect(english).toHaveAttribute("aria-checked", "true");
  expect(repo.save).toHaveBeenCalledWith("account-a", 0, {
    schemaVersion: 1,
    learningLanguages: [
      { code: "nl", paused: false },
      { code: "en", paused: true },
    ],
    disabledDictionaryIds: [],
  });
  await act(async () =>
    finish({
      kind: "saved",
      snapshot: {
        revision: 1,
        document: {
          schemaVersion: 1,
          learningLanguages: [
            { code: "nl", paused: false },
            { code: "en", paused: true },
          ],
          disabledDictionaryIds: [],
        },
      },
    }),
  );
  expect(english).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("switch", { name: "Study Dutch" })).toBeDisabled();
});
test("failed saves leave the accepted document intact and a second explicit click retries", async () => {
  const repo = repository();
  repo.save = vi
    .fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce({
      kind: "saved",
      snapshot: {
        revision: 1,
        document: {
          schemaVersion: 1,
          learningLanguages: [
            { code: "nl", paused: false },
            { code: "en", paused: true },
          ],
          disabledDictionaryIds: [],
        },
      },
    });
  render(view(repo));
  const english = await screen.findByRole("switch", { name: "Study English" });
  fireEvent.click(english);
  await screen.findByText(getUiMessages("en").materialPreferences.saveError);
  expect(english).toHaveAttribute("aria-checked", "true");
  fireEvent.click(english);
  await waitFor(()=>expect(screen.queryByText(getUiMessages("en").materialPreferences.saving)).toBeNull());
  expect(screen.queryByText("Saved")).toBeNull();
  expect(repo.save).toHaveBeenCalledTimes(2);
});
test("conflict replaces stale selection with the server winner and does not silently reapply", async () => {
  const repo = repository();
  repo.save = vi.fn().mockResolvedValue({
    kind: "conflict",
    snapshot: {
      revision: 2,
      document: {
        schemaVersion: 1,
        learningLanguages: [
          { code: "en", paused: false },
          { code: "nl", paused: true },
        ],
        disabledDictionaryIds: [],
      },
    },
  });
  render(view(repo));
  fireEvent.click(await screen.findByRole("switch", { name: "Study English" }));
  await screen.findByText(getUiMessages("en").materialPreferences.conflict);
  expect(repo.save).toHaveBeenCalledOnce();
  expect(screen.getByRole("switch", { name: "Study Dutch" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});
test("failed document or catalog loads expose retry, not invented empty settings", async () => {
  const repo = repository();
  repo.languages = vi
    .fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValue(catalog);
  render(view(repo));
  await screen.findByText(getUiMessages("en").materialPreferences.loadError);
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.getByRole("button", { name: "Add language" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("switch", { name: "Study Dutch" });
});
test("late old-account write cannot populate the newly signed-in account", async () => {
  const repo = repository();
  let finish!: (
    result: Awaited<ReturnType<MaterialRepository["save"]>>,
  ) => void;
  repo.save = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const mounted = render(view(repo));
  fireEvent.click(await screen.findByRole("switch", { name: "Study English" }));
  mounted.rerender(view(repo, "account-b"));
  await screen.findByRole("switch", { name: "Study English" });
  await act(async () =>
    finish({
      kind: "saved",
      snapshot: {
        revision: 7,
        document: {
          schemaVersion: 1,
          learningLanguages: [
            { code: "en", paused: true },
            { code: "nl", paused: false },
          ],
          disabledDictionaryIds: [],
        },
      },
    }),
  );
  expect(screen.getByRole("switch", { name: "Study English" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(screen.getByTestId("state")).toHaveTextContent('"revision":0');
});
test("an older read cannot overwrite the newer focus refresh", async () => {
  let finish!: (value: MaterialPreferencesSnapshot) => void;
  const repo = repository();
  repo.load = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({
      revision: 3,
      document: {
        schemaVersion: 1,
        learningLanguages: [{ code: "en", paused: false }],
        disabledDictionaryIds: [],
      },
    });
  render(view(repo));
  fireEvent.focus(window);
  await screen.findByRole("switch", { name: "Study English" });
  await act(async () => finish(emptyMaterialPreferences()));
  expect(screen.getByTestId("state")).toHaveTextContent('"revision":3');
  expect(screen.queryByRole("switch", { name: "Study Dutch" })).toBeNull();
});
test.each(["en", "nl", "ru"] as const)(
  "language controls and save feedback use the %s catalog",
  async (language) => {
    render(view(repository(), "account-a", language));
    const copy = getUiMessages(language).settings;
    await screen.findByRole("switch", {
      name:
        language === "ru"
          ? "Изучать: Английский"
          : language === "nl"
            ? "Leer Engels"
            : "Study English",
    });
    expect(
      screen.getByRole("heading", { name: copy.learningLanguages }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.addLanguage })).toBeTruthy();
  },
);
test("dictionary switches use real inventory/IDs; personal entries remain enabled", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  dictionaries.mockImplementation(async ({ languageCode }) =>
    languageCode === "nl"
      ? [
          {
            id,
            languageCode: "nl",
            name: "Real dictionary",
            kind: "curated",
            entryCount: 123,
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            languageCode: "nl",
            name: "Personal",
            kind: "user",
            entryCount: 2,
          },
        ]
      : [],
  );
  const repo = repository();
  render(view(repo, "account-a", "en", true));
  const toggle = await screen.findByRole("switch", {
    name: "Use Real dictionary",
  });
  expect(screen.getByText("123 entries")).toBeTruthy();
  expect(
    screen.getByRole("switch", {
      name: "Personal dictionary is always enabled",
    }),
  ).toBeDisabled();
  fireEvent.click(toggle);
  await waitFor(()=>expect(screen.queryByText(getUiMessages("en").materialPreferences.saving)).toBeNull());
  expect(screen.queryByText("Saved")).toBeNull();
  expect(repo.save).toHaveBeenCalledWith("account-a", 0, {
    ...emptyMaterialPreferences().document,
    disabledDictionaryIds: [id],
  });
});
test("dictionary transport failure shows retry rather than no published dictionaries", async () => {
  dictionaries.mockRejectedValueOnce(new Error()).mockResolvedValue([]);
  render(view(repository(), "account-a", "en", true));
  await screen.findByText(getUiMessages("en").materialPreferences.catalogError);
  expect(screen.queryByText("No published dictionaries available.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(
      screen.getAllByText("No published dictionaries available.").length,
    ).toBe(2),
  );
});

const dialogPrototype = HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(
  dialogPrototype,
  "showModal",
);
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, "close");
beforeAll(() => {
  Object.defineProperties(dialogPrototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
});
afterAll(() => {
  if (originalShow)
    Object.defineProperty(dialogPrototype, "showModal", originalShow);
  else Reflect.deleteProperty(dialogPrototype, "showModal");
  if (originalClose)
    Object.defineProperty(dialogPrototype, "close", originalClose);
  else Reflect.deleteProperty(dialogPrototype, "close");
});
test("learning picker uses canonical identity, relevant guidance and restores opener focus while saving", async () => {
  // This test characterizes selection and focus, independently of lazy chunk compilation.
  await import("@/components/practice/settings/LanguagePicker");
  const repo = repository();
  let finish!: (
    result: Awaited<ReturnType<MaterialRepository["save"]>>,
  ) => void;
  repo.save = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(view(repo));
  const opener = screen.getByRole("button", { name: "Add language" });
  await waitFor(() => expect(opener).toHaveAttribute("aria-disabled", "false"));
  opener.focus();
  fireEvent.click(opener);
  const search = await screen.findByRole("textbox");
  expect(
    screen.getByText(getUiMessages("en").languagePicker.learningFooter),
  ).toBeTruthy();
  fireEvent.change(search, { target: { value: "pl" } });
  fireEvent.click(
    await screen.findByRole("button", { name: "Polish polski pl" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(opener).toHaveFocus();
  expect(opener).toHaveAttribute("aria-disabled", "true");
  const document = vi.mocked(repo.save).mock.calls[0][2];
  expect(document.learningLanguages.at(-1)).toEqual({
    code: "pl",
    paused: false,
  });
  await act(async () =>
    finish({ kind: "saved", snapshot: { revision: 1, document } }),
  );
  expect(opener).toHaveAttribute("aria-disabled", "false");
});


test("focus refresh keeps an already loaded launch control enabled; failure blocks it", async () => {
  let finish!: (value: MaterialPreferencesSnapshot) => void;
  let reject!: (error: Error) => void;
  const repo = repository();
  function Launch() { const account = useAccountMaterial(); return <button disabled={account?.status !== "ready"}>Start training</button>; }
  render(<AccountMaterialProvider userId="account-a" repository={repo}><Launch /></AccountMaterialProvider>);
  const start = screen.getByRole("button", {name: "Start training"});
  expect(start).toBeDisabled();
  await waitFor(() => expect(start).toBeEnabled());
  vi.mocked(repo.load).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.focus(window);
  expect(start).toBeEnabled();
  await act(async () => finish(emptyMaterialPreferences()));
  expect(start).toBeEnabled();
  vi.mocked(repo.load).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  fireEvent.focus(window);
  await act(async () => reject(new Error("offline")));
  expect(start).toBeDisabled();
});
