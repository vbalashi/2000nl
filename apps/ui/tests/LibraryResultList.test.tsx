import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  LibraryResultList,
  LibraryResultRow,
} from "@/components/practice/library/LibraryResultList";

test("shared list retains article/content language, localized count and independent select/expand intents", () => {
  const select = vi.fn(),
    expand = vi.fn();
  render(
    <LibraryResultList language="ru">
      <LibraryResultRow
        headword="fiets"
        article="de"
        parts={["zn"]}
        core="2K"
        source="My exact source"
        meaningCount={21}
        contentLanguage="nl"
        language="ru"
        selected
        onSelect={select}
        onExpandAll={expand}
      />
    </LibraryResultList>,
  );
  const row = screen.getByRole("button");
  expect(row).toHaveTextContent("de fiets");
  expect(row).toHaveTextContent("21 значение");
  expect(row).toHaveTextContent("существительное");
  expect(row).toHaveTextContent("My exact source");
  expect(screen.getByText("de")).toHaveClass(/article/);
  expect(
    screen.getByText("fiets", { exact: false }).closest('[lang="nl"]'),
  ).toBeInTheDocument();
  fireEvent.click(row);
  expect(select).toHaveBeenCalledTimes(1);
  expect(expand).not.toHaveBeenCalled();
  fireEvent.doubleClick(row);
  expect(expand).toHaveBeenCalledTimes(1);
});
