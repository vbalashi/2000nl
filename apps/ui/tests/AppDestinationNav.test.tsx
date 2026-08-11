import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppDestinationNav } from "@/components/navigation/AppDestinationNav";

test("desktop destinations have icons and mobile selector navigates between peers", () => {
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

  const selector = screen.getByRole("button", {
    name: "Choose destination: Training",
  });
  fireEvent.click(selector);

  const menu = screen.getByRole("menu", { name: "Choose destination" });
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Library" }));

  expect(onNavigate).toHaveBeenCalledWith("library");
  expect(
    screen.queryByRole("menu", { name: "Choose destination" }),
  ).not.toBeInTheDocument();
});

test("mobile selector supports menu keyboard navigation and restores trigger focus", async () => {
  render(
    <AppDestinationNav
      active="statistics"
      interfaceLanguage="ru"
      onNavigate={vi.fn()}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "Выбрать раздел: Статистика",
    }),
  );
  expect(
    screen.getByRole("menu", { name: "Выбрать раздел" }),
  ).toBeInTheDocument();
  const statistics = screen.getByRole("menuitem", { name: "Статистика" });
  for (const item of screen.getAllByRole("menuitem")) {
    expect(item).toHaveAttribute("tabindex", "-1");
  }
  await vi.waitFor(() => expect(statistics).toHaveFocus());

  fireEvent.keyDown(statistics, { key: "ArrowDown" });
  const training = screen.getByRole("menuitem", { name: "Тренировка" });
  expect(training).toHaveFocus();

  fireEvent.keyDown(training, { key: "Escape" });
  expect(
    screen.queryByRole("menu", { name: "Выбрать раздел" }),
  ).not.toBeInTheDocument();
  await vi.waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Выбрать раздел: Статистика" }),
    ).toHaveFocus(),
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Выбрать раздел: Статистика" }),
  );
  const reopenedStatistics = screen.getByRole("menuitem", {
    name: "Статистика",
  });
  await vi.waitFor(() => expect(reopenedStatistics).toHaveFocus());
  fireEvent.keyDown(reopenedStatistics, { key: "Tab" });
  expect(
    screen.queryByRole("menu", { name: "Выбрать раздел" }),
  ).not.toBeInTheDocument();
  await vi.waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Выбрать раздел: Статистика" }),
    ).toHaveFocus(),
  );
});

test("keeps the compact mobile bottom tabs free of destination icons", () => {
  render(
    <AppDestinationNav
      active="training"
      interfaceLanguage="en"
      mobileVariant="tabs"
      onNavigate={vi.fn()}
    />,
  );

  const mobileTabs = screen.getByRole("navigation", { name: "Primary" });
  expect(mobileTabs.querySelector("svg")).not.toBeInTheDocument();
});
