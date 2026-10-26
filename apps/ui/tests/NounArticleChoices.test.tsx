import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NounArticleChoices } from "@/components/practice/ui/NounArticleChoices";
test("de and het toggle independently; both and neither emit no restriction", () => {
  const change=vi.fn();
  function Harness() {
    const [article,setArticle]=useState<"de"|"het"|null>(null);
    return <NounArticleChoices article={article} className="choice" onChange={value=>{change(value);setArticle(value);}}/>;
  }
  render(<Harness/>);
  const de=screen.getByRole("button",{name:"de"}),het=screen.getByRole("button",{name:"het"});
  expect(de).toHaveAttribute("aria-pressed","false");
  fireEvent.click(de);expect(change).toHaveBeenLastCalledWith("de");
  fireEvent.click(het);expect(change).toHaveBeenLastCalledWith(null);
  expect(de).toHaveAttribute("aria-pressed","true");expect(het).toHaveAttribute("aria-pressed","true");
  fireEvent.click(de);expect(change).toHaveBeenLastCalledWith("het");
  fireEvent.click(het);expect(change).toHaveBeenLastCalledWith(null);
  expect(de).toHaveAttribute("aria-pressed","false");expect(het).toHaveAttribute("aria-pressed","false");
});
