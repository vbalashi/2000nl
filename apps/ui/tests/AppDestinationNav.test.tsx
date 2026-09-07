import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppDestinationNav } from "@/components/navigation/AppDestinationNav";

test("desktop destinations keep icons without rendering a mobile selector", () => {
  const onNavigate = vi.fn();

  render(
    <AppDestinationNav
      active="training"
      interfaceLanguage="en"
      onNavigate={onNavigate}
    />,
  );

  const desktopNav = screen.getByRole("navigation", { name: "Primary" });
  for (const destination of ["Training", "Library", "Statistics"]) {
    const button = within(desktopNav).getByRole("button", {
      name: destination,
    });
    expect(button.querySelector("svg")).toBeInTheDocument();
  }
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Choose destination/i }),
  ).not.toBeInTheDocument();
});

test("exposes all peer destinations in the selected interface language", () => {
  const onNavigate = vi.fn();

  render(
    <AppDestinationNav
      active="statistics"
      interfaceLanguage="ru"
      onNavigate={onNavigate}
    />,
  );

  const mobileTabs = screen.getByRole("navigation", { name: "Primary" });
  expect(
    within(mobileTabs).getByRole("button", { name: "Статистика" }),
  ).toHaveAttribute("aria-current", "page");
  fireEvent.click(
    within(mobileTabs).getByRole("button", { name: "Библиотека" }),
  );
  expect(onNavigate).toHaveBeenCalledWith("library");
});
