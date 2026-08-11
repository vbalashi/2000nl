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

test("mobile tabs expose all peer destinations and navigate directly", () => {
  const onNavigate = vi.fn();

  render(
    <AppDestinationNav
      active="statistics"
      interfaceLanguage="ru"
      variant="mobile-tabs"
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

test("keeps the compact mobile bottom tabs free of destination icons", () => {
  render(
    <AppDestinationNav
      active="training"
      interfaceLanguage="en"
      variant="mobile-tabs"
      onNavigate={vi.fn()}
    />,
  );

  const mobileTabs = screen.getByRole("navigation", { name: "Primary" });
  expect(mobileTabs.querySelector("svg")).not.toBeInTheDocument();
});
