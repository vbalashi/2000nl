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
 const ratingGroup=screen.getByRole("button",{name:label}).closest("[role=group]")!;
 expect(ratingGroup).toHaveAttribute("data-compact","true");
 expect(ratingGroup).toHaveStyle({"--rating-height":"28px"});
 fireEvent.click(screen.getByRole("button",{name:label}));
 expect(action).toHaveBeenCalledOnce();
 expect(action).toHaveBeenCalledWith(meaning.reviewCapabilities.find(cap=>cap.reviewResult===result));
 expect(screen.queryByRole("button",{name:"Train next"})).not.toBeInTheDocument();
});

for(const language of ['ru','en','nl'] as const)test(`${language}: active card has an explanatory slot and blocked mutation items`,()=>{
 const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,language).meanings[1];
 const action=vi.fn(),exclude=vi.fn(),report=vi.fn(),collections=vi.fn();
 render(<LibraryMeaningActions meaning={meaning} language={language} busy={false} collectionCount={1}
   activeTraining headwordTrainingBlocked onAction={action} onExclude={exclude} onReport={report} onCollections={collections}/>);
 const t=getUiMessages(language).activeTrainingCard;
 expect(screen.getByRole('note')).toHaveTextContent(t.title);
 expect(screen.getByRole('note')).toHaveTextContent(t.hint);
 expect(screen.queryByRole('button',{name:platformV2Message(language,meaning.startLearning!.messageKey)})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:getUiMessages(language).library.moreActions}));
 const exclusion=screen.getByRole('menuitem',{name:getUiMessages(language).trainingSession.exclusion.headwordLabel});
 const known=screen.getByRole('menuitem',{name:platformV2Message(language,meaning.markKnown!.messageKey)});
 expect(exclusion).toBeDisabled();expect(known).toBeDisabled();
 expect(exclusion).toHaveAccessibleDescription(t.actionHint);
 expect(known).toHaveAccessibleDescription(t.actionHint);
 fireEvent.click(exclusion);fireEvent.click(known);
 expect(action).not.toHaveBeenCalled();expect(exclude).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('menuitem',{name:platformV2Message(language,'senseCard.report')}));
 expect(report).toHaveBeenCalledOnce();
});

test('sibling Learn and Known stay available while word-wide exclusion is protected',()=>{
 const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,'en').meanings[1];
 const action=vi.fn();
 render(<LibraryMeaningActions meaning={meaning} language="en" busy={false} collectionCount={0} headwordTrainingBlocked onAction={action} onExclude={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Learn'}));expect(action).toHaveBeenCalledWith(meaning.startLearning);
 fireEvent.click(screen.getByRole('button',{name:getUiMessages('en').library.moreActions}));
 expect(screen.getByRole('menuitem',{name:getUiMessages('en').trainingSession.exclusion.headwordLabel})).toBeDisabled();
 expect(screen.getByRole('menuitem',{name:'Mark as known'})).toBeEnabled();
});

for (const included of [true,false]) test(`current collection menu uses exact ${included ? 'remove' : 'add'} action and keeps picker`,()=>{
 const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,'en').meanings[1];
 const toggle=vi.fn(),choose=vi.fn();
 render(<LibraryMeaningActions meaning={meaning} language="en" busy={false} collectionCount={0} onAction={vi.fn()}
   onCollections={choose} currentCollection={{name:'Anna’s lesson',included,busy:false,onToggle:toggle}}/>);
 const trigger=screen.getByRole('button',{name:'Collections'});
 expect(trigger).toHaveAttribute('aria-haspopup','menu'); fireEvent.click(trigger);
 fireEvent.click(screen.getByRole('menuitem',{name:included?'Remove from “Anna’s lesson”':'Add to “Anna’s lesson”'}));
 expect(toggle).toHaveBeenCalledOnce(); expect(choose).not.toHaveBeenCalled(); expect(trigger).toHaveFocus();
 fireEvent.click(trigger);fireEvent.click(screen.getByRole('menuitem',{name:'Choose collections…'}));
 expect(choose).toHaveBeenCalledOnce();expect(toggle).toHaveBeenCalledOnce();
});
test('unknown membership offers only the full picker; pending quick writes cannot repeat',()=>{
 const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,'en').meanings[1],toggle=vi.fn();
 const props={meaning,language:'en' as const,busy:false,collectionCount:0,onAction:vi.fn(),onCollections:vi.fn()};
 const view=render(<LibraryMeaningActions {...props} currentCollection={{name:'Lesson',included:null,busy:false,onToggle:toggle}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Collections'}));
 expect(screen.getAllByRole('menuitem')).toHaveLength(1);
 fireEvent.keyDown(screen.getByRole('menuitem'),{key:'Escape'});
 view.rerender(<LibraryMeaningActions {...props} currentCollection={{name:'Lesson',included:true,busy:true,onToggle:toggle}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Collections'}));
 const remove=screen.getByRole('menuitem',{name:'Remove from “Lesson”'});expect(remove).toBeDisabled();fireEvent.click(remove);
 expect(toggle).not.toHaveBeenCalled();
});

test("archive is an explicit authoritative owner action, never inferred from ordinary content",()=>{
 const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,"en").meanings[1];
 const archive=vi.fn();
 const {rerender}=render(<LibraryMeaningActions meaning={meaning} language="en" busy={false} collectionCount={0} onAction={vi.fn()} onArchive={archive}/>);
 fireEvent.click(screen.getByRole("button",{name:getUiMessages("en").library.moreActions}));
 expect(screen.queryByRole("menuitem",{name:"Archive entry"})).not.toBeInTheDocument();
 fireEvent.keyDown(screen.getByRole("menu"),{key:"Escape"});
 rerender(<LibraryMeaningActions meaning={{...meaning,canArchive:true}} language="en" busy={false} collectionCount={0} onAction={vi.fn()} onArchive={archive}/>);
 fireEvent.click(screen.getByRole("button",{name:getUiMessages("en").library.moreActions}));
 fireEvent.click(screen.getByRole("menuitem",{name:"Archive entry"}));
 expect(archive).toHaveBeenCalledOnce();
});

test('own-note editor has a separate menu owner and does not trigger learning or collection actions',()=>{
 const meaning=buildLibrarySenseCardGroupModel(multiSenseBankGroup,'en').meanings[1];const note=vi.fn(),learn=vi.fn(),collections=vi.fn();
 render(<LibraryMeaningActions meaning={meaning} language="en" busy={false} collectionCount={0} onAction={learn} onCollections={collections} onEditNote={note}/>);
 const trigger=screen.getByRole('button',{name:getUiMessages('en').library.moreActions});fireEvent.click(trigger);fireEvent.click(screen.getByRole('menuitem',{name:'My note'}));expect(note).toHaveBeenCalledOnce();expect(learn).not.toHaveBeenCalled();expect(collections).not.toHaveBeenCalled();expect(trigger).toHaveFocus();
});
