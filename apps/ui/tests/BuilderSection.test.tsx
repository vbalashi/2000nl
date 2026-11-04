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

test("header actions and expanded choices are siblings of the disclosure", () => {
  const onToggle=vi.fn(), onAction=vi.fn();
  const props={id:"source",title:"Source",summary:"Chosen dictionary",open:false,onToggle,
    headerActions:<button onClick={onAction}>Search sources</button>,
    headerChoices:<button>All types</button>};
  const view=render(<BuilderSection {...props}>Source options</BuilderSection>);
  const heading=screen.getByRole("button",{name:"Source Chosen dictionary"});
  const search=screen.getByRole("button",{name:"Search sources"});
  expect(heading.contains(search)).toBe(false);
  expect(screen.queryByRole("button",{name:"All types"})).toBeNull();
  fireEvent.click(search);
  expect(onAction).toHaveBeenCalledOnce();
  expect(onToggle).not.toHaveBeenCalled();
  fireEvent.click(heading);
  expect(onToggle).toHaveBeenCalledOnce();
  view.rerender(<BuilderSection {...props} open>Source options</BuilderSection>);
  expect(screen.getByRole("button",{name:"All types"})).toBeInTheDocument();
  expect(heading).toHaveAttribute("aria-expanded","true");
  expect(screen.getByTestId("source-summary")).toHaveTextContent("Chosen dictionary");
});
