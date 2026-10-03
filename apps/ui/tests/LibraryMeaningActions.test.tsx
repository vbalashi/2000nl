import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LibraryMeaningActions } from "@/components/training/library-v2/LibraryMeaningActions";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

for (const language of ["en","nl","ru"] as const) test(`${language}: Learn is primary, Known and Report use separate menu owners`,()=>{
  const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,language).meanings[1];
  const action=vi.fn(),train=vi.fn(),report=vi.fn();
  render(<LibraryMeaningActions meaning={meaning} language={language} busy={false} collectionCount={1}
    onAction={action} onTrainNext={train} onReport={report}/>);
  fireEvent.click(screen.getByRole("button",{name:platformV2Message(language,meaning.startLearning!.messageKey)}));
  expect(action).toHaveBeenCalledWith(meaning.startLearning);expect(train).not.toHaveBeenCalled();action.mockClear();
  const more=screen.getByRole("button",{name:getUiMessages(language).library.moreActions});fireEvent.click(more);
  const known=screen.getByRole("menuitem",{name:platformV2Message(language,meaning.markKnown!.messageKey)});
  expect(known).toHaveFocus();fireEvent.keyDown(known,{key:"End"});
  const flag=screen.getByRole("menuitem",{name:platformV2Message(language,"senseCard.report")});expect(flag).toHaveFocus();
  fireEvent.click(flag);expect(report).toHaveBeenCalledOnce();expect(action).not.toHaveBeenCalled();expect(more).toHaveFocus();
  fireEvent.click(more);fireEvent.click(screen.getByRole("menuitem",{name:platformV2Message(language,meaning.markKnown!.messageKey)}));
  expect(action).toHaveBeenCalledWith(meaning.markKnown);expect(report).toHaveBeenCalledOnce();
});

test("busy blocks primary and menu mutations",()=>{
 const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,"en").meanings[1],action=vi.fn();
 render(<LibraryMeaningActions meaning={meaning} language="en" busy collectionCount={0} onAction={action}/>);
 for(const button of screen.getAllByRole("button")) { expect(button).toBeDisabled();fireEvent.click(button); }
 expect(action).not.toHaveBeenCalled();expect(screen.queryByRole("menu")).toBeNull();
});


test.each([ ["Again","fail"], ["Hard","hard"], ["Good","success"], ["Easy","easy"] ])("inline %s submits the exact authoritative capability",(label,result)=>{
 const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,"en").meanings[0];
 const action=vi.fn();
 render(<LibraryMeaningActions meaning={meaning} language="en" busy={false} collectionCount={0} onAction={action}/>);
 fireEvent.click(screen.getByRole("button",{name:label}));
 expect(action).toHaveBeenCalledOnce();
 expect(action).toHaveBeenCalledWith(meaning.reviewCapabilities.find(cap=>cap.reviewResult===result));
 expect(screen.queryByRole("button",{name:"Train next"})).not.toBeInTheDocument();
});
