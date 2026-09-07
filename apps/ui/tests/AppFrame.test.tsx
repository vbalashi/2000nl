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

test("owns one accessible application header and main content landmark", () => {
  renderFrame();

  expect(screen.getByTestId("app-header")).toBeInTheDocument();
  expect(screen.getByLabelText("2000nl")).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("Destination content");
  expect(screen.getAllByRole("navigation")).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "Destinations: Training" }),
  ).toBeVisible();
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
  expect(
    screen.getByRole("button", { name: "Destinations: Training" }),
  ).toBeDisabled();
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

test("keeps menu placement internal and exposes its state to assistive technology", () => {
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

  const menuButton = screen.getByRole("button", {
    name: "Destinations: Training",
  });
  expect(menuButton).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(menuButton);
  expect(menuButton).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(
    within(screen.getByRole("group", { name: "Destinations" })).getByRole(
      "button",
      { name: "Library" },
    ),
  );
  expect(onNavigate).toHaveBeenCalledWith("library");
  expect(menuButton).toHaveAttribute("aria-expanded", "false");
  expect(menuButton).toHaveFocus();
});

test("closes the compact destination menu with Escape and restores focus", () => {
  renderFrame();

  const menuButton = screen.getByRole("button", {
    name: "Destinations: Training",
  });
  fireEvent.click(menuButton);
  expect(screen.getByRole("group", { name: "Destinations" })).toBeVisible();

  fireEvent.keyDown(document, { key: "Escape" });

  expect(screen.queryByRole("group", { name: "Destinations" })).toBeNull();
  expect(menuButton).toHaveFocus();
});

test("shows the current secondary destination in the compact header control", () => {
  render(
    <AppFrame
      activeDestination="settings"
      interfaceLanguage="en"
      themePreference="system"
      onNavigate={vi.fn()}
      onCycleTheme={vi.fn()}
      onOpenSettings={vi.fn()}
    >
      <p>Settings content</p>
    </AppFrame>,
  );

  expect(
    screen.getByRole("button", { name: "Destinations: Settings" }),
  ).toHaveTextContent("Settings");
});
