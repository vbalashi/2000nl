import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { buildSentenceCardPresentation } from "@/lib/training/sentenceCardPresentation";
import { resolveSentenceExerciseContent } from "@/lib/training/sentenceExerciseContent";
import { TrainingExerciseCard } from "@/components/training/v2/TrainingExerciseCard";
import {TrainingInteractionPreferencesProvider,defaultTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
import { goedGroup } from "./platformV2IdiomHierarchyFixture";

function model() {
  const content = resolveSentenceExerciseContent({
    entryId: "entry-goed", contentNodeId: "idiom-example-goed", sourceTextFingerprint: "fingerprint-idiom-example-goed",
  }, structuredClone(goedGroup))!;
  content.sentence.translations = [{
    translationId: "ru-example", targetLanguageCode: "ru", status: "ready", text: "Деньги пойдут на помощь пострадавшим.",
    sourceTextFingerprint: content.sentence.sourceTextFingerprint, translationPolicyVersion: "v1",
  }];
  return { content, presentation: buildSentenceCardPresentation({ content, interfaceLanguage: "en", translationTargetLanguageCode: "ru" })! };
}

test("shows only the selected example after reveal, with its translation already visible", () => {
  const { content, presentation } = model();
  function Card() {
    const [revealed, setRevealed] = React.useState(false);
    return <TrainingExerciseCard presentation={presentation} interfaceLanguage="en" revealed={revealed} onReveal={() => setRevealed(true)} busy={false} onGrade={vi.fn()} />;
  }
  render(<Card />);
  expect(screen.getByText(presentation.prompt.text)).toBeVisible();
  expect(screen.queryByText(content.sentence.text)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
  expect(screen.getByText(content.sentence.text)).toBeVisible();
  expect(screen.getByTestId("training-question-reminder")).toHaveTextContent(presentation.prompt.text);
  expect(presentation.answer.examples.map((node) => node.contentNodeId)).toEqual([content.sentence.contentNodeId]);
  expect(presentation.answer.definitions).toEqual([]);
  expect(presentation.promptTarget).toEqual({ contentNodeId: content.sentence.contentNodeId, kind: "translation" });
  expect(screen.getByRole("button", { name: "Again" })).toHaveFocus();
});

test("a missing target-language translation cannot expose the original sentence as a prompt", () => {
  const { content } = model();
  expect(buildSentenceCardPresentation({ content, interfaceLanguage: "en", translationTargetLanguageCode: "de" })).toBeNull();
});

test("context answers retain available headword syllables for the shared gesture",()=>{
 const {content}=model();content.group.header.displayPronunciation="ge·noeg";
 const presentation=buildSentenceCardPresentation({content,interfaceLanguage:"en",translationTargetLanguageCode:"ru"})!;
 expect(presentation.answer.headword).toBe("ge·noeg");
});

test("sentence answer keeps exact-entry instructional notes without turning them into a prompt",()=>{
 const {content}=model();const notes=[{noteId:"teacher-note",ownerUserId:"teacher",text:"Teaching addition",revision:"1",isOwn:false}];
 const presentation=buildSentenceCardPresentation({content:{...content,entry:{...content.entry,noteMaterial:notes}},interfaceLanguage:"en",translationTargetLanguageCode:"ru"})!;
 expect(presentation.answer.noteMaterial).toEqual(notes);expect(presentation.prompt.text).not.toContain("Teaching addition");
});

test("accepts the first exercise rating during animation and blocks it while saving",()=>{
 vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({left:0,top:0,width:300,height:400} as DOMRect);
 const previous=Object.getOwnPropertyDescriptor(HTMLElement.prototype,"animate");
 Object.defineProperty(HTMLElement.prototype,"animate",{configurable:true,value:()=>({onfinish:null,oncancel:null,cancel:vi.fn()})});
 try {
  const {presentation}=model();const onGrade=vi.fn();
  function Card(){const [revealed,setRevealed]=React.useState(false),[busy,setBusy]=React.useState(false);return <TrainingInteractionPreferencesProvider userId="animation-test" initial={{...defaultTrainingInteractions,animation:true}}><TrainingExerciseCard presentation={presentation} interfaceLanguage="en" revealed={revealed} onReveal={()=>setRevealed(true)} busy={busy} onGrade={grade=>{onGrade(grade);setBusy(true);}}/></TrainingInteractionPreferencesProvider>}
  render(<Card/>);fireEvent.click(screen.getByRole("button",{name:"Show answer"}));
  expect(document.querySelector('[data-training-reveal-overlay]')).not.toBeNull();
  const good=screen.getByRole("button",{name:"Good"});expect(good).toBeEnabled();fireEvent.click(good);
  expect(onGrade).toHaveBeenCalledOnce();expect(onGrade).toHaveBeenCalledWith("success");expect(good).toBeDisabled();fireEvent.click(good);expect(onGrade).toHaveBeenCalledOnce();
 } finally {vi.restoreAllMocks();if(previous)Object.defineProperty(HTMLElement.prototype,"animate",previous);else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;}
});
