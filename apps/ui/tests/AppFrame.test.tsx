import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
