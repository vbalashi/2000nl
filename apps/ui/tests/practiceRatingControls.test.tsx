import React from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {RatingControls} from "@/components/practice/RatingControls";
import {WordIdentity} from "@/components/practice/ui/WordIdentity";
import {getTrainingRatingLabels} from "@/components/training/trainingHotkeys";
beforeEach(()=>{vi.stubGlobal("ResizeObserver",class{observe(){} disconnect(){}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
for(const language of ["en","nl","ru"] as const)test(`rating actions retain identity with ${language} labels`,()=>{
 const rate=vi.fn();render(<RatingControls language={language} onRate={rate}/>);
 for(const [rating,label] of Object.entries(getTrainingRatingLabels(language))){fireEvent.click(screen.getByRole("button",{name:label}));expect(rate).toHaveBeenLastCalledWith(rating);}
 expect(rate).toHaveBeenCalledTimes(4);
});
test("word identity separates the article without changing accessible text",()=>{
 const {container}=render(<h1><WordIdentity article="het" headword="huis"/></h1>);
 expect(screen.getByRole("heading",{name:"het huis"})).toBeTruthy();expect(container.querySelector("h1 > span")?.textContent).toBe("het");
});

test("adaptive session buttons use 46 px in one row and 28 px in two; compact stays compact",()=>{
 const width=vi.spyOn(HTMLElement.prototype,"clientWidth","get").mockReturnValue(800);
 try{
  const view=render(<RatingControls height="adaptive" onRate={()=>{}}/>);
  const group=screen.getByLabelText("Rate your answer");expect(group.getAttribute("data-columns")).toBe("4");expect(group.style.getPropertyValue("--rating-height")).toBe("46px");
  view.rerender(<RatingControls height="adaptive" layout="two" onRate={()=>{}}/>);
  expect(group.getAttribute("data-columns")).toBe("2");expect(group.style.getPropertyValue("--rating-height")).toBe("28px");
  view.rerender(<RatingControls height={28} onRate={()=>{}}/>);expect(group.style.getPropertyValue("--rating-height")).toBe("28px");
 }finally{width.mockRestore();}
});
