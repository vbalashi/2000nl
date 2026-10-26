import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { BuilderSection } from "@/components/practice/builder/BuilderSection";
test("a closed section is excluded from focus navigation and exposes its state through the heading", () => {
  const onToggle = vi.fn();
  const props = { title: "Filters", summary: "Nouns", open: false, onToggle };
  const view = render(
    <BuilderSection {...props}>
      <button>Nested action</button>
    </BuilderSection>,
  );
  const heading = screen.getByRole("button", { name: "Filters Nouns" });
  const body = document.getElementById(heading.getAttribute("aria-controls")!);
  expect(body).toHaveAttribute("inert");
  expect(body).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByRole("button", { name: "Nested action" })).toBeNull();
  fireEvent.click(heading);
  expect(onToggle).toHaveBeenCalledOnce();
  view.rerender(
    <BuilderSection {...props} open>
      <button>Nested action</button>
    </BuilderSection>,
  );
  expect(body).not.toHaveAttribute("inert");
  expect(
    screen.getByRole("button", { name: "Nested action" }),
  ).toBeInTheDocument();
  expect(heading).toHaveAttribute("aria-expanded", "true");
});
test("multiple builders do not reuse disclosure control identities", () => {
  render(
    <>
      <BuilderSection title="One" summary="" open={false} onToggle={() => {}}>
        First
      </BuilderSection>
      <BuilderSection title="Two" summary="" open={false} onToggle={() => {}}>
        Second
      </BuilderSection>
    </>,
  );
  const one = screen
      .getByRole("button", { name: "One" })
      .getAttribute("aria-controls"),
    two = screen
      .getByRole("button", { name: "Two" })
      .getAttribute("aria-controls");
  expect(one).not.toBe(two);
  expect(document.getElementById(one!)).toBeInTheDocument();
  expect(document.getElementById(two!)).toBeInTheDocument();
});
