import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppFrame } from "@/components/navigation/AppFrame";

function renderFrame() {
  return render(
    <AppFrame
      activeDestination="training"
      interfaceLanguage="en"
      themePreference="system"
      onNavigate={vi.fn()}
      onCycleTheme={vi.fn()}
      onOpenSettings={vi.fn()}
    >
      <p>Destination content</p>
    </AppFrame>,
  );
}

test("owns the approved header, tab navigation and main content landmark", () => {
  renderFrame();

  expect(screen.getByTestId("app-header")).toBeInTheDocument();
  expect(screen.getByLabelText("2000nl")).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("Destination content");
  expect(screen.getAllByRole("navigation")).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Training" })).toHaveLength(2);
});

test("routes desktop destination choices through one typed callback", () => {
  const onNavigate = vi.fn();
  render(
    <AppFrame
      activeDestination="training"
      interfaceLanguage="en"
      themePreference="system"
      onNavigate={onNavigate}
      onCycleTheme={vi.fn()}
      onOpenSettings={vi.fn()}
    >
      <p>Content</p>
    </AppFrame>,
  );

  fireEvent.click(
    within(screen.getAllByRole("navigation", { name: "Primary" })[0]).getByRole(
      "button",
      { name: "Library" },
    ),
  );
  expect(onNavigate).toHaveBeenCalledWith("library");
});

test("disables every frame-owned navigation control during a blocked transition", () => {
  render(
    <AppFrame
      activeDestination="training"
      interfaceLanguage="en"
      themePreference="system"
      navigationDisabled
      onNavigate={vi.fn()}
      onCycleTheme={vi.fn()}
      onOpenSettings={vi.fn()}
    >
      <p>Content</p>
    </AppFrame>,
  );

  for (const navigation of screen.getAllByRole("navigation", {
    name: "Primary",
  })) {
    for (const button of within(navigation).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  }
  expect(screen.getByRole("button", { name: "2000nl: Training" })).toBeDisabled();
});

test("can disable utility controls while the frame is blocked", () => {
  render(
    <AppFrame
      activeDestination="training"
      interfaceLanguage="en"
      themePreference="system"
      navigationDisabled
      utilitiesDisabled
      onNavigate={vi.fn()}
      onCycleTheme={vi.fn()}
      onOpenSettings={vi.fn()}
    >
      <p>Content</p>
    </AppFrame>,
  );

  expect(screen.getByRole("button", { name: "Theme: System" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Settings" })).toBeDisabled();
});

test("approved tabs route destination choices through the owner callback", () => {
  const onNavigate = vi.fn();
  render(
    <AppFrame
      activeDestination="training"
      interfaceLanguage="en"
      themePreference="system"
      onNavigate={onNavigate}
      onCycleTheme={vi.fn()}
      onOpenSettings={vi.fn()}
    >
      <p>Content</p>
    </AppFrame>,
  );

  const tabs = document.querySelector('[data-app-mobile-navigation="tabs"]') as HTMLElement;
  fireEvent.click(within(tabs).getByRole("button", { name: "Library" }));
  expect(onNavigate).toHaveBeenCalledWith("library");
});

test("shows the active Settings utility in the approved header", () => {
  render(
    <AppFrame
      activeDestination="settings"
      settingsActive
      interfaceLanguage="en"
      themePreference="system"
      onNavigate={vi.fn()}
      onCycleTheme={vi.fn()}
      onOpenSettings={vi.fn()}
    >
      <p>Settings content</p>
    </AppFrame>,
  );

  expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-current", "page");
});

test("approved bottom tabs are always present and immersive sessions mark the frame", () => {
    const onNavigate = vi.fn();
    const { container, rerender } = render(
      <AppFrame activeDestination="library" interfaceLanguage="en" themePreference="system"
        onNavigate={onNavigate} onCycleTheme={vi.fn()} onOpenSettings={vi.fn()}>
        <p>Destination content</p>
      </AppFrame>,
    );
    expect(container.querySelector('[data-app-mobile-navigation="menu"]')).toBeNull();
    const tabs = container.querySelector('[data-app-mobile-navigation="tabs"]') as HTMLElement;
    expect(tabs).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: "Library" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(tabs).getByRole("button", { name: "Statistics" }));
    expect(onNavigate).toHaveBeenCalledWith("statistics");
    expect(container.querySelector("[data-app-frame]")).not.toHaveAttribute("data-immersive");
    rerender(
      <AppFrame activeDestination="training" interfaceLanguage="en" themePreference="system" immersive
        onNavigate={onNavigate} onCycleTheme={vi.fn()} onOpenSettings={vi.fn()}>
        <p>Session</p>
      </AppFrame>,
    );
    expect(container.querySelector("[data-app-frame]")).toHaveAttribute("data-immersive", "true");
});


test("logo navigates through the owner callback and obeys pending navigation lock", () => {
  const onNavigate = vi.fn();
  const props = { activeDestination: "settings" as const, interfaceLanguage: "en" as const,
    themePreference: "system" as const, onNavigate, onCycleTheme: vi.fn(), onOpenSettings: vi.fn() };
  const view = render(<AppFrame {...props}><p>Settings</p></AppFrame>);
  fireEvent.click(screen.getByRole("button", { name: "2000nl: Training" }));
  expect(onNavigate).toHaveBeenCalledWith("training");
  onNavigate.mockClear();
  view.rerender(<AppFrame {...props} navigationDisabled><p>Settings</p></AppFrame>);
  const logo = screen.getByRole("button", { name: "2000nl: Training" });
  expect(logo).toBeDisabled();
  fireEvent.click(logo);
  expect(onNavigate).not.toHaveBeenCalled();
});


test("hides mobile navigation during keyboard resize and restores it afterwards", () => {
  const viewport = new EventTarget() as VisualViewport;
  Object.assign(viewport, { height: 800, offsetTop: 0, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  const view = render(<AppFrame activeDestination="library" interfaceLanguage="en" themePreference="system" onNavigate={vi.fn()} onCycleTheme={vi.fn()} onOpenSettings={vi.fn()}><input aria-label="Word" /></AppFrame>);
  const frame = view.container.querySelector("[data-app-frame]")!;
  act(() => screen.getByLabelText("Word").focus());
  act(() => { Object.assign(viewport, { height: 500 }); viewport.dispatchEvent(new Event("resize")); });
  expect(frame).toHaveAttribute("data-keyboard-open", "true");
  act(() => { Object.assign(viewport, { height: 800 }); viewport.dispatchEvent(new Event("resize")); });
  expect(frame).not.toHaveAttribute("data-keyboard-open");
  view.unmount();
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
  vi.unstubAllGlobals();
});

test("blocks landscape on a phone and restores the same content in portrait", () => {
  const orientation = new EventTarget() as ScreenOrientation;
  Object.defineProperty(orientation, "type", { configurable: true, value: "portrait-primary" });
  vi.stubGlobal("screen", { width: 402, height: 874, orientation });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  const view = renderFrame();
  const frame = view.container.querySelector("[data-app-frame]")!;
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  Object.defineProperty(orientation, "type", { configurable: true, value: "landscape-primary" });
  act(() => orientation.dispatchEvent(new Event("change")));
  expect(screen.getByRole("alert")).toHaveTextContent("Turn your phone upright to continue.");
  expect(frame).toHaveAttribute("inert");
  expect(frame).toHaveAttribute("aria-hidden", "true");
  Object.defineProperty(orientation, "type", { configurable: true, value: "portrait-primary" });
  act(() => orientation.dispatchEvent(new Event("change")));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(frame).not.toHaveAttribute("inert");
  expect(screen.getByRole("main")).toHaveTextContent("Destination content");
  view.unmount();
  vi.unstubAllGlobals();
});

test("does not mistake a resized keyboard viewport for phone rotation", () => {
  const orientation = new EventTarget() as ScreenOrientation;
  Object.defineProperty(orientation, "type", { configurable: true, value: "portrait-primary" });
  vi.stubGlobal("screen", { width: 402, height: 874, orientation });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  const view = renderFrame();
  act(() => window.dispatchEvent(new Event("resize")));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  view.unmount();
  vi.unstubAllGlobals();
});
