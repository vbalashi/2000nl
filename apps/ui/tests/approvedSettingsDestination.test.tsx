import React from "react";
import { afterEach, beforeAll, afterAll, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import {
  SettingsDestination,
  type SettingsDestinationProps,
} from "@/components/navigation/SettingsDestination";
import { ReadingPreferencesProvider } from "@/components/reading/ReadingPreferencesProvider";
import { getUiMessages } from "@/lib/uiMessages";
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
function props(): SettingsDestinationProps {
  return {
    open: true,
    interfaceLanguage: "en",
    themePreference: "system",
    translationLanguage: "de",
    onThemeChange: vi.fn(),
    onInterfaceLanguageChange: vi.fn(),
    onTranslationLanguageChange: vi.fn(),
    onSignOut: vi.fn(),
    onExit: vi.fn(),
    userEmail: "learner@example.test",
  };
}
function desktop(label: string) {
  return within(
    screen.getByRole("navigation", { name: "Settings sections" }),
  ).getByRole("button", { name: label });
}
test("approved settings keep production callback ownership and an existing extra translation language", async () => {
  const p = props();
  render(<SettingsDestination {...p} />);
  expect(screen.getByRole("button",{name:"German"})).toHaveAttribute("aria-pressed","true");
  fireEvent.click(screen.getByRole("button", { name: "Off" }));
  expect(p.onTranslationLanguageChange).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByLabelText("Interface language"));
  fireEvent.click(await screen.findByRole("menuitem", {name:"Русский"}));
  expect(p.onInterfaceLanguageChange).toHaveBeenCalledWith("ru");
  fireEvent.click(desktop("Appearance"));
  fireEvent.click(screen.getByRole("button", { name: "Dark" }));
  expect(p.onThemeChange).toHaveBeenCalledWith("dark");
  fireEvent.click(desktop("Shortcuts"));
  expect(
    screen.getByRole("heading", { name: "Training shortcuts" }),
  ).toBeTruthy();
  fireEvent.click(desktop("Account"));
  expect(screen.getByText("learner@example.test")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(p.onSignOut).toHaveBeenCalledOnce();
  expect(screen.queryByText("Free")).toBeNull();
});
test("phone navigation supports return focus, app exit and a fresh menu on reopening", async () => {
  const p = props();
  const view = render(<SettingsDestination {...p} />);
  const appearance = within(
    screen.getByRole("navigation", { name: "Mobile settings sections" }),
  ).getByRole("button", { name: "Appearance" });
  fireEvent.click(appearance);
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("heading", { name: "Appearance" })
        .find((element) => element.getAttribute("tabindex") === "-1"),
    ).toHaveFocus(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
  await waitFor(() => expect(appearance).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "Back to app" }));
  expect(p.onExit).toHaveBeenCalledOnce();
  fireEvent.click(appearance);
  view.rerender(<SettingsDestination {...p} open={false} />);
  view.rerender(<SettingsDestination {...p} />);
  expect(screen.getByRole("button", { name: "Back to app" })).toBeTruthy();
});
test.each(["en", "nl", "ru"] as const)(
  "approved sections and accessible controls follow the %s catalog",
  (language) => {
    const p = { ...props(), interfaceLanguage: language };
    render(<SettingsDestination {...p} />);
    const copy = getUiMessages(language).settings;
    expect(
      screen.getByRole("heading", { name: copy.title, level: 1 }),
    ).toBeTruthy();
    expect(screen.getByLabelText(copy.interfaceLanguage)).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("navigation", { name: copy.sections })).getByRole(
        "button",
        { name: copy.shortcuts },
      ),
    );
    expect(
      screen.getByRole("heading", { name: copy.trainingShortcuts }),
    ).toBeTruthy();
  },
);
test("appearance keeps the account text profile owner when its panel is reopened", async () => {
  const repository = {
    load: vi.fn().mockResolvedValue({ phone: "normal", desktop: "extra" }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <ReadingPreferencesProvider userId="a" repository={repository}>
      <SettingsDestination {...props()} />
    </ReadingPreferencesProvider>,
  );
  fireEvent.click(desktop("Appearance"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Extra large" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  fireEvent.click(desktop("Languages"));
  fireEvent.click(desktop("Appearance"));
  expect(screen.getByRole("button", { name: "Extra large" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(repository.load).toHaveBeenCalledOnce();
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
test("searching another translation language emits its canonical code and restores picker focus", async () => {
  // This interaction contract uses the real lazy picker. Finish its cold
  // catalog module initialization before the role query's 1s polling window.
  await import("@/components/practice/settings/LanguagePicker");
  const p = props();
  render(<SettingsDestination {...p} />);
  const opener = screen.getByRole("button",{name:"Translation language"});
  opener.focus();
  fireEvent.click(opener);
  const search = await screen.findByRole("textbox");
  fireEvent.change(search, { target: { value: "pol" } });
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Polish polski pl" }),
  );
  expect(p.onTranslationLanguageChange).toHaveBeenCalledWith("pl");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(opener).toHaveFocus();
});


test("translation Off remembers the previous language and its label re-enables it",()=>{
 const p=props();const view=render(<SettingsDestination {...p}/>);
 fireEvent.click(screen.getByRole("button",{name:"Off"}));
 view.rerender(<SettingsDestination {...p} translationLanguage={null}/>);
 expect(screen.getByRole("button",{name:"Off"})).toHaveAttribute("aria-pressed","true");
 fireEvent.click(screen.getByRole("button",{name:"German"}));
 expect(p.onTranslationLanguageChange).toHaveBeenLastCalledWith("de");
 expect(screen.getByRole("button",{name:"Translation language"})).toHaveAttribute("aria-haspopup","dialog");
});
