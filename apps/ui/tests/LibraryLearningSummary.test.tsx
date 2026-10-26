import React from "react";
import {render,screen} from "@testing-library/react";
import {expect,test} from "vitest";
import {LibraryLearningSummary} from "@/components/training/library-v2/LibraryLearningSummary";
import {buildLibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import {multiSenseBankGroup} from "./platformV2LibraryFixture";
const model=()=>buildLibrarySenseCardGroupModel(multiSenseBankGroup,"en").meanings[0];
for(const language of ["en","nl","ru"] as const) test(`renders translated scheduling labels (${language})`,()=>{
 const meaning={...model(),schedulerPhase:"reviewing" as const,reviewCount:3,lastGrade:3 as const,nextDueAt:"2026-10-03T10:00:00Z"};
 const view=render(<LibraryLearningSummary meaning={meaning} language={language}/>);
 expect(view.container.querySelector("time")).toHaveAttribute("dateTime",meaning.nextDueAt);
 expect(view.container.textContent).not.toContain("senseCard.");
});
test("ungraded enrollment differs from missing telemetry and paused scheduling",()=>{
 const view=render(<LibraryLearningSummary meaning={{...model(),schedulerPhase:"learning",reviewCount:0,lastGrade:null}} language="en"/>);
 expect(screen.getByText("Not rated yet")).toBeVisible();
 view.rerender(<LibraryLearningSummary meaning={{...model(),schedulerPhase:"frozen",reviewCount:null,lastGrade:null,nextDueAt:"2026-10-03T10:00:00Z"}} language="en"/>);
 expect(screen.queryByText("Not rated yet")).toBeNull();expect(view.container.querySelector("time")).toBeNull();
});
test("learning due takes precedence without falling back to later review schedule",()=>{
 const group=structuredClone(multiSenseBankGroup);const entry=group.entries.find(e=>e.kind==="sense-card")!;
 if(entry.kind!=="sense-card"||!entry.card)throw new Error("fixture");
 entry.card.scheduler={phase:"learning",reviewCount:2,lastGrade:1,learningDueAt:"2026-10-03T10:00:00Z",nextReviewAt:"2026-10-20T10:00:00Z"};
 expect(buildLibrarySenseCardGroupModel(group,"en").meanings[0].nextDueAt).toBe("2026-10-03T10:00:00Z");
 entry.card.scheduler.learningDueAt=null;
 expect(buildLibrarySenseCardGroupModel(group,"en").meanings[0].nextDueAt).toBeNull();
 entry.card.scheduler.phase="reviewing";
 expect(buildLibrarySenseCardGroupModel(group,"en").meanings[0].nextDueAt).toBe("2026-10-20T10:00:00Z");
});
