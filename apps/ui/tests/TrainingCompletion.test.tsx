import React from "react";
import { fireEvent,render,screen } from "@testing-library/react";
import { expect,test,vi } from "vitest";
import { TrainingCompletion } from "@/components/training/v2/TrainingCompletion";

test("shows saved active time and keeps the three action priorities",()=>{
 const next=vi.fn(),edit=vi.fn(),home=vi.fn();
 render(<TrainingCompletion interfaceLanguage="en" completedCount={10} activeMilliseconds={260000} onRestart={next} onEdit={edit} onExit={home}/>);
 expect(screen.getByText("10 cards · 4 min 20 sec")).toBeVisible();
 const buttons=screen.getAllByRole("button");
 expect(buttons.map(b=>b.textContent)).toEqual(["Another 10 cards","Modify training","Back to home"]);
 buttons.forEach(button=>fireEvent.click(button));
 expect(next).toHaveBeenCalledOnce(); expect(edit).toHaveBeenCalledOnce(); expect(home).toHaveBeenCalledOnce();
});
test("missing time is omitted and pending launch fences duplicate actions",()=>{
 render(<TrainingCompletion interfaceLanguage="ru" completedCount={10} pending onRestart={vi.fn()} onEdit={vi.fn()} onExit={vi.fn()}/>);
 expect(screen.getByText("10 карточек")).toBeVisible();
 expect(screen.queryByText(/0 мин/)).toBeNull();
 screen.getAllByRole("button").forEach(button=>expect(button).toBeDisabled());
});
