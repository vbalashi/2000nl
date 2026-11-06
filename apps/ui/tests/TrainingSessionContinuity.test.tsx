import React from "react";
import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, expect, test} from "vitest";
import {TrainingSessionSurface, TrainingSessionFrame} from "@/components/training/v2/TrainingSessionSurface";
import type {TrainingSessionChromeProps} from "@/components/training/v2/TrainingSessionChrome";

afterEach(cleanup);
const chrome: TrainingSessionChromeProps = {interfaceLanguage:"en", scenario:"meaning", mode:"word-to-definition", cardFilter:"both", sessionName:"Practice", presentation:{kind:"planned",position:1,total:10,fraction:.1},onClose:()=>{}};
const footer = {} as React.ComponentProps<typeof TrainingSessionSurface>["footer"];
function Session({position, phase, card}: {position:number; phase:"ready"|"loading"|"failure"; card:string}) {
 const current={...chrome,presentation:{kind:"planned" as const,position,total:10,fraction:position/10}};
 return <TrainingSessionFrame chrome={current}>
   <TrainingSessionSurface key={card} phase={phase} chrome={current} footer={footer}><div>{card}</div></TrainingSessionSurface>
 </TrainingSessionFrame>;
}
test("keeps the same progress and session controls across card remounts, loading and completion",()=>{
 const {rerender}=render(<Session position={1} phase="ready" card="one"/>);
 const progress=screen.getByRole("progressbar"), close=screen.getByRole("button",{name:"Close session"});
 for(const [position,phase,card] of [[2,"loading","two"],[2,"ready","two"],[10,"failure","complete"]] as const){
   rerender(<Session position={position} phase={phase} card={card}/>);
   expect(screen.getByRole("progressbar")).toBe(progress);
   expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow",String(position));
   expect(screen.getByRole("button",{name:"Close session"})).toBe(close);
   expect(screen.queryByTestId("training-session-position")).toBeNull();
 }
});
