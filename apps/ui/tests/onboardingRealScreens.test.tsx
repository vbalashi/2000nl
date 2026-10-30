import React from "react";
import {cleanup,render,screen,fireEvent} from "@testing-library/react";
import {MeaningLearningProgress} from "@/components/practice/MeaningLearningProgress";
import {OwnedCollectionSharingView} from "@/components/library/sharing/OwnedCollectionSharing";
import {previewMeaningProgress} from "@/app/dev/onboarding-preview/progressFixture";
vi.mock("@/components/practice/ui/DialogSurface",()=>({DialogSurface:React.forwardRef(function Dialog({children}:{children:React.ReactNode},_ref){return <div>{children}</div>;})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test("the actual progress panel renders supplied directions without fetching account data",async()=>{
 const fetchSpy=vi.spyOn(globalThis,"fetch");const close=vi.fn();
 render(<MeaningLearningProgress entryId="fixture-entry" language="ru" initialProgress={previewMeaningProgress("fixture-entry",true)} onClose={close}/>);
 expect(await screen.findByText("de bank")).toBeVisible();
 expect(screen.getAllByRole("heading",{level:3})).toHaveLength(2);
 expect(fetchSpy).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:/Закрыть/}));expect(close).toHaveBeenCalledOnce();
});
test("the actual sharing dialog keeps its create-link confirmation before a command",()=>{
 const run=vi.fn(async()=>{}),fetchSpy=vi.spyOn(globalThis,"fetch");
 const controller={state:{key:"fixture",status:"ready" as const,data:{collectionId:"00000000-0000-4000-8000-000000000010",isOpen:false,revision:0,invitationCode:null,subscriberCount:0}},rejection:null,refresh:async()=>{},run};
 render(<OwnedCollectionSharingView userId="onboarding-preview" collectionId={controller.state.data.collectionId} name="Fixture collection" locale="ru" controller={controller} onClose={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Создать ссылку просмотра"}));
 expect(run).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Подтвердить"}));
 expect(run).toHaveBeenCalledWith("open");expect(fetchSpy).not.toHaveBeenCalled();
});

test("the library example starts with a ready result and requires no typing", async()=>{
 const {JourneyScreens}=await import("@/app/dev/onboarding-preview/JourneyScreens");
 const {emptyJourney}=await import("@/app/dev/onboarding-preview/journeyState");
 const onStage=vi.fn();
 render(<JourneyScreens stage="result" language="ru" translation="ru" journey={emptyJourney()} commit={()=>true} onStage={onStage} selectedEntryId={null} onSelectEntry={()=>{}} collectionId={null} onSelectCollection={()=>{}} saveError={false} restoredBuilder={null} onBuilderChange={()=>{}} onPreviewStats={()=>{}} onOpenCatalog={()=>{}}/>);
 const search=screen.getByRole("textbox",{name:"Найти слово…"});
 expect(search).toHaveValue("bank");expect(search).toHaveAttribute("readonly");
 fireEvent.click(screen.getByTestId("library-headword-group-headword-bank"));
 expect(onStage).toHaveBeenCalledWith("meaning");
});

test("the collection button is not mistaken for the meaning statistics trigger", async()=>{
 const {JourneyScreens}=await import("@/app/dev/onboarding-preview/JourneyScreens");
 const {emptyJourney}=await import("@/app/dev/onboarding-preview/journeyState");
 const {gateFurnitureEntry}=await import("@/lib/platform/fixtures/senseCardV1GateFixture");
 const onStage=vi.fn(),onStats=vi.fn();
 const {container}=render(<JourneyScreens stage="collections" language="ru" translation="ru" journey={emptyJourney()} commit={()=>true} onStage={onStage} selectedEntryId={gateFurnitureEntry.entryId} onSelectEntry={()=>{}} collectionId={null} onSelectCollection={()=>{}} saveError={false} restoredBuilder={null} onBuilderChange={()=>{}} onPreviewStats={onStats} onOpenCatalog={()=>{}}/>);
 const button=container.querySelector(`[data-entry-id="${gateFurnitureEntry.entryId}"] [data-testid="library-service-actions"] button`);
 expect(button).not.toBeNull();fireEvent.click(button!);
 expect(onStage).toHaveBeenCalledWith("new-collection");expect(onStats).not.toHaveBeenCalled();
});
