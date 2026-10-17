import React from "react";
import {beforeEach,expect,test,vi} from "vitest";
import {act,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {CardTranslationLanguagesProvider,AdditionalCardTranslationProvider} from "@/components/practice/article/AdditionalCardTranslation";
import {ArticleTranslation,ArticleContentNode} from "@/components/practice/article/ArticleContent";
import {TrainingExerciseCard} from "@/components/training/v2/TrainingExerciseCard";
import {TrainingSenseCardStage} from "@/components/training/v2/TrainingSenseCardStage";
import {buildTrainingSenseCardModel} from "@/components/training/v2/trainingSenseCardModel";
import {LibrarySenseCardGroup} from "@/components/training/library-v2/LibrarySenseCardGroup";
import {buildLibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import {singleSenseEntry,singleSenseGroup} from "./platformV2TrainingFixture";
import type {PlatformHeadwordGroupV2,PlatformSenseCardEntryV2} from "../../../packages/shared/types/platformV2";

const {lookup,request}=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock("@/lib/platform/platformV2LibraryClient",()=>({fetchPlatformV2LibraryGroup:lookup}));
vi.mock("@/lib/platform/platformV2TrainingMediaClient",()=>({requestPlatformV2Translation:request}));
function secondaryGroup(language="ru"):PlatformHeadwordGroupV2 {
 return {...singleSenseGroup,entries:[{...singleSenseEntry,capabilities:[],translation:{...singleSenseEntry.translation!,targetLanguageCode:language,text:language==="ru"?"рука":"Hand"},contentNodes:singleSenseEntry.contentNodes.map(node=>({...node,translations:[{...node.translations[0],targetLanguageCode:language,text:node.kind==="definition"?"конец руки с пальцами":"Она крепко держала письмо в руке."}]}))}]};
}
beforeEach(()=>{lookup.mockReset().mockResolvedValue(secondaryGroup());request.mockReset();vi.stubGlobal("BroadcastChannel",undefined);});
function Article({primary="en",secondary="ru",visible=true}:{primary?:string|null;secondary?:string|null;visible?:boolean}) {
 return <CardTranslationLanguagesProvider primary={primary} secondary={secondary}><AdditionalCardTranslationProvider entryId={singleSenseEntry.entryId} contentLanguage="nl" visible={visible}><ArticleTranslation translationKey="entry" text={primary&&primary!=="off"?"hand":undefined} language={primary??undefined} visible={visible}/><ArticleContentNode node={{...singleSenseEntry.contentNodes[0],translation:primary&&primary!=="off"?"the end of your arm":undefined,children:[]}} interfaceLanguage="en" contentLanguage="nl" translationLanguage={primary??undefined} translationVisible={visible}/></AdditionalCardTranslationProvider></CardTranslationLanguagesProvider>;
}

test.each([["en",null],[null,null],["off",null],["ru","ru"],[null,"ru"],["off","ru"]])("no additional lookup for primary %s and secondary %s",async(primary,secondary)=>{
 render(<Article primary={primary} secondary={secondary}/>);
 await act(async()=>{});
 expect(lookup).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();
});
test("shows two languages in order without replacing source or primary translation",async()=>{
 const {container}=render(<Article/>);
 await screen.findByText("рука",{exact:false});
 expect(container.querySelector('[data-translation-language="en"]')).toHaveTextContent("hand");
 expect(container.querySelector('[data-translation-language="ru"]')).toHaveTextContent("рука");
 expect(screen.getByText(singleSenseEntry.contentNodes[0].text)).toBeInTheDocument();
 expect(screen.getByText("конец руки с пальцами",{exact:false})).toBeInTheDocument();
 expect(lookup).toHaveBeenCalledWith(expect.objectContaining({translationTargetLanguageCode:"ru",cardTypeId:"word-to-definition"}));
 expect(request).not.toHaveBeenCalled();
});
test("waits for explicit card translation reveal",async()=>{
 const view=render(<Article visible={false}/>);
 await act(async()=>{});expect(lookup).not.toHaveBeenCalled();
 view.rerender(<Article/>);await screen.findByText("рука",{exact:false});
});
test("a secondary lookup failure keeps the primary readable and retries independently",async()=>{
 lookup.mockRejectedValueOnce(new Error("offline"));
 const {container}=render(<Article/>);
 await waitFor(()=>expect(screen.getAllByRole("button",{name:/retry/i}).length).toBeGreaterThan(0));
 expect(container.querySelector('[data-translation-language="en"]')).toHaveTextContent("hand");
 fireEvent.click(screen.getAllByRole("button",{name:/retry/i})[0]);
 await screen.findByText("рука",{exact:false});
 expect(request).not.toHaveBeenCalled();
});
test("prepares the secondary through its own server capability and refreshes its projection",async()=>{
 const ready=secondaryGroup();const entry=ready.entries[0] as PlatformSenseCardEntryV2;
 const incomplete={...ready,entries:[{...entry,translation:null,contentNodes:entry.contentNodes.map(node=>({...node,translations:[]})),capabilities:[{actionId:"request-translation" as const,elementId:"translate",messageKey:"senseCard.translation.request",target:{kind:"entry" as const,entryId:entry.entryId,contentRevision:entry.contentRevision},targetLanguageCode:"ru"}]}]};
 lookup.mockResolvedValueOnce(incomplete).mockResolvedValue(ready);request.mockResolvedValue("ready");
 render(<Article/>);await screen.findByText("рука",{exact:false});
 expect(request).toHaveBeenCalledWith(expect.objectContaining({targetLanguageCode:"ru"}),expect.anything());
});
test("ignores a late previous-language response",async()=>{
 let finish!:(group:PlatformHeadwordGroupV2)=>void;
 lookup.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValue(secondaryGroup("de"));
 const view=render(<Article/>);await waitFor(()=>expect(lookup).toHaveBeenCalledOnce());
 view.rerender(<Article secondary="de"/>);await screen.findByText("Hand",{exact:false});
 await act(async()=>finish(secondaryGroup()));
 expect(screen.queryByText("рука",{exact:false})).toBeNull();
});
test("does not render a node translation from a different source revision",async()=>{
 const group=secondaryGroup();(group.entries[0] as PlatformSenseCardEntryV2).contentNodes[0].sourceTextFingerprint="different-revision";
 lookup.mockResolvedValue(group);render(<Article/>);await screen.findByText("рука",{exact:false});
 expect(screen.queryByText("конец руки с пальцами",{exact:false})).toBeNull();
});
test("reverse face and hint stay unchanged; secondary reads start only on the answer translation",async()=>{
 const model=buildTrainingSenseCardModel({group:singleSenseGroup,entry:singleSenseEntry,interfaceLanguage:"en"});
 const view=(side:"face"|"answer")=><CardTranslationLanguagesProvider primary="en" secondary="ru"><TrainingSenseCardStage model={model} mode="definition-to-word" contentLanguage="nl" translationLanguage="en" interfaceLanguage="en" side={side} onSideChange={vi.fn()} onAction={vi.fn()}/></CardTranslationLanguagesProvider>;
 const {rerender}=render(view("face"));
 expect(screen.getByTestId("reverse-prompt")).toHaveTextContent(singleSenseEntry.contentNodes[0].text);
 expect(lookup).not.toHaveBeenCalled();
 rerender(view("answer"));expect(lookup).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Translate"}));
 await screen.findByText("рука",{exact:false});
 rerender(view("face"));expect(screen.getByTestId("reverse-prompt")).toHaveTextContent(singleSenseEntry.contentNodes[0].text);
 expect(screen.queryByText("рука",{exact:false})).toBeNull();
});
test("Library disables translation when only a secondary language is stored",async()=>{
 const group={...singleSenseGroup,entries:[{...singleSenseEntry,translation:null,contentNodes:singleSenseEntry.contentNodes.map(node=>({...node,translations:[]}))}]};
 const model=buildLibrarySenseCardGroupModel(group,"en");
 render(<CardTranslationLanguagesProvider primary={null} secondary="ru"><LibrarySenseCardGroup model={model} interfaceLanguage="en" contentLanguage="nl" translationEnabled={false} onAction={vi.fn()}/></CardTranslationLanguagesProvider>);
 expect(screen.queryByRole("button",{name:"Translate"})).toBeNull();
 await act(async()=>{});expect(lookup).not.toHaveBeenCalled();
});


test("exercise answer reveals the secondary without waiting for a pending primary provider",async()=>{
 const model=buildTrainingSenseCardModel({group:singleSenseGroup,entry:singleSenseEntry,interfaceLanguage:"en"});
 render(<CardTranslationLanguagesProvider primary="en" secondary="ru"><TrainingExerciseCard entryId={singleSenseEntry.entryId} contentLanguage="nl" translationLanguage="en" presentation={{label:"Recall",prompt:{kind:"explanation",text:"primary question"},promptTarget:{kind:"text",contentNodeId:"definition-1"},answer:model}} interfaceLanguage="en" revealed onReveal={vi.fn()} busy={false} onGrade={vi.fn()} onRequestTranslation={()=>new Promise(()=>{})}/></CardTranslationLanguagesProvider>);
 fireEvent.click(screen.getByRole("button",{name:"Translate"}));
 await screen.findByText("рука",{exact:false});
});


test("context card prepares and retains the additional projection before revealing its answer", async () => {
 const ready=secondaryGroup("en");
 const entry=ready.entries[0] as PlatformSenseCardEntryV2;
 const incomplete={...ready,entries:[{...entry,translation:null,contentNodes:entry.contentNodes.map(node=>({...node,translations:[]})),capabilities:[{actionId:"request-translation" as const,elementId:"translate",messageKey:"senseCard.translation.request",target:{kind:"entry" as const,entryId:entry.entryId,contentRevision:entry.contentRevision},targetLanguageCode:"en"}]}]};
 lookup.mockResolvedValueOnce(incomplete).mockResolvedValue(ready);
 request.mockResolvedValue("ready");
 const model=buildTrainingSenseCardModel({group:singleSenseGroup,entry:singleSenseEntry,interfaceLanguage:"en"});
 const view=(side:"face"|"answer")=><CardTranslationLanguagesProvider primary="ru" secondary="en" ownerId="owner"><TrainingSenseCardStage model={model} mode="definition-to-word" contentLanguage="nl" translationLanguage="ru" interfaceLanguage="en" side={side} onSideChange={vi.fn()} onAction={vi.fn()} contextPrompt={{text:"Русский вопрос",sourceText:singleSenseEntry.contentNodes[1].text,contentNodeId:singleSenseEntry.contentNodes[1].contentNodeId,sourceTextFingerprint:singleSenseEntry.contentNodes[1].sourceTextFingerprint}}/></CardTranslationLanguagesProvider>;
 const rendered=render(view("face"));
 await waitFor(()=>expect(lookup).toHaveBeenCalledTimes(2));
 expect(request).toHaveBeenCalledOnce();
 expect(request).toHaveBeenCalledWith(expect.objectContaining({targetLanguageCode:"en"}),expect.anything());
 expect(rendered.container.querySelector('[data-translation-language="en"]')).toBeNull();
 expect(screen.getByTestId("reverse-prompt")).toHaveTextContent("Русский вопрос");
 const count=lookup.mock.calls.length;
 // Any lookup on reveal remains unresolved, proving the ready projection was retained.
 lookup.mockImplementation(()=>new Promise(()=>{}));
 rendered.rerender(view("answer"));
 expect(rendered.container.querySelector('[data-translation-language="en"]')).toHaveTextContent("Hand");
 await act(async()=>{});
 expect(lookup).toHaveBeenCalledTimes(count);
 expect(request).toHaveBeenCalledOnce();
});


test.each([["off","en"],[null,"en"],["en","en"]])("context preload suppresses secondary when primary=%s and secondary=%s", async (primary,secondary) => {
 render(<CardTranslationLanguagesProvider primary={primary} secondary={secondary}><AdditionalCardTranslationProvider entryId={singleSenseEntry.entryId} contentLanguage="nl" visible={false} preload><span>Question</span></AdditionalCardTranslationProvider></CardTranslationLanguagesProvider>);
 await act(async()=>{});
 expect(lookup).not.toHaveBeenCalled();
 expect(request).not.toHaveBeenCalled();
});
