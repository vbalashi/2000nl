import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DirectionCard } from "@/components/practice/builder/DirectionCard";
import { directionExample } from "@/lib/training/directionExamples";
test.each(["nl","en"])("concrete %s examples preserve language and toggle callback", language => {
  const pair=directionExample(language,"meaning")!;
  const toggle=vi.fn();
  render(<DirectionCard label="Reverse" selected={false} onClick={toggle} prompt={pair[1]} answer={pair[0]}
    promptLanguage={language} answerLanguage={language} classes={{card:"card",heading:"heading",check:"check",prompt:"prompt",answer:"answer"}}/>);
  expect(screen.getByText(pair[0])).toHaveAttribute("lang",language);
  expect(screen.getByText(pair[1])).toHaveAttribute("lang",language);
  fireEvent.click(screen.getByRole("button"));expect(toggle).toHaveBeenCalledOnce();
});
test("unknown language and unsupported family use label fallback rather than another language's sample",()=>{
  expect(directionExample("fr","meaning")).toBeNull();
  expect(directionExample("nl","word-in-context")).toBeNull();
  expect(directionExample("nl","word-in-context","ru")).toEqual(["de fiets","Я езжу на работу на велосипеде."]);
  expect(directionExample("nl","sentence")).toBeNull();
  expect(directionExample("en","idiom")?.[0]).toBe("Break the ice");
});

test("translation examples require both selected languages",()=>{
  expect(directionExample("nl","sentence","ru")).toEqual(["Ik ga met de fiets naar mijn werk.","Я езжу на работу на велосипеде."]);
  expect(directionExample("en","sentence","nl")).toEqual(["I go to work by bicycle.","Ik ga met de fiets naar mijn werk."]);
  expect(directionExample("nl","sentence","fr")).toBeNull();
});
