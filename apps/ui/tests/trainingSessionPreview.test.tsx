import React from "react";
import {act,cleanup,fireEvent,render,screen,within,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {TrainingSessionPrototype} from "@/app/dev/session-builder-prototype/TrainingSessionPrototype";
import {RecentActivity} from "@/app/dev/session-builder-prototype/RecentActivity";
import {initialDraft} from "@/app/dev/session-builder-prototype/model";
import {previewExercise,type PreviewRun} from "@/app/dev/session-builder-prototype/sessionPreviewModel";
const run:PreviewRun={id:1,trainingId:"core",name:"Core vocabulary",draft:{...initialDraft,size:2},translation:"English"};
beforeEach(()=>{
 vi.stubGlobal("ResizeObserver",class {observe(){} disconnect(){}});
 Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});
 Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
 Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
function props(overrides:Partial<Pick<React.ComponentProps<typeof TrainingSessionPrototype>,"run"|"active">>={}){return {run,active:true,onClose:vi.fn(),onHistory:vi.fn(),onAction:vi.fn(),onProgress:vi.fn(),...overrides};}
test("only explicit grading advances progress and adds an activity item",()=>{
 const p=props();render(<TrainingSessionPrototype {...p}/>);
 expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
 expect(screen.queryByRole("button",{name:"Good"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Show answer"}));expect(p.onAction).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Good"}));
 expect(p.onAction).toHaveBeenCalledTimes(1);expect(p.onAction.mock.calls[0][0]).toMatchObject({word:"de fiets",result:"Good"});
 expect(p.onProgress).toHaveBeenCalledWith(1);expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
 expect(screen.getByRole("button",{name:"Show answer"})).toBeTruthy();
});
test("pausing retains typed text and reveal state",()=>{
 const p=props({run:{...run,draft:{...run.draft,mode:"Type the answer"}}});const view=render(<TrainingSessionPrototype {...p}/>);
 fireEvent.change(screen.getByRole("textbox",{name:"Your answer"}),{target:{value:"een fiets"}});
 view.rerender(<TrainingSessionPrototype {...p} active={false}/>);view.rerender(<TrainingSessionPrototype {...p}/>);
 expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("een fiets");
 fireEvent.click(screen.getByRole("button",{name:"Compare answer"}));
 view.rerender(<TrainingSessionPrototype {...p} active={false}/>);view.rerender(<TrainingSessionPrototype {...p}/>);
 expect(screen.getByRole("button",{name:"Good"})).toBeTruthy();expect(screen.getByText("Your answer: een fiets")).toBeTruthy();expect(p.onAction).not.toHaveBeenCalled();
});
test("Library details are read-only and returning preserves the exercise",async()=>{
 const p=props();render(<TrainingSessionPrototype {...p}/>);
 fireEvent.click(screen.getByRole("button",{name:"Open word details"}));
 const details=screen.getByRole("dialog",{name:"Word details"});expect(within(details).getByText("fietsen")).toBeTruthy();
 expect(within(details).queryByRole("button",{name:"Learn"})).toBeNull();
 fireEvent.click(within(details).getByRole("button",{name:"Close word details"}));
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(screen.getByRole("button",{name:"Show answer"})).toBeTruthy();expect(p.onAction).not.toHaveBeenCalled();
});
test("completion stops the queue and leaves history accessible",()=>{
 const p=props();render(<TrainingSessionPrototype {...p}/>);
 for(let i=0;i<2;i++){fireEvent.click(screen.getByRole("button",{name:"Show answer"}));fireEvent.click(screen.getByRole("button",{name:"Easy"}));}
 expect(screen.getByRole("heading",{name:"Session complete"})).toBeTruthy();expect(p.onAction).toHaveBeenCalledTimes(2);expect(screen.queryByRole("button",{name:"Show answer"})).toBeNull();
 fireEvent.click(screen.getAllByRole("button",{name:"Recent activity"})[0]);expect(p.onHistory).toHaveBeenCalledOnce();
});
test("recent activity displays actions across sessions and handles an empty list",()=>{
 const view=render(<RecentActivity items={[]} onClose={()=>{}}/>);expect(screen.getByText(/No activity yet/)).toBeTruthy();
 view.rerender(<RecentActivity items={[{id:"1",word:"fiets",exercise:"Words · Direct",result:"Hard",at:"2026-09-28T10:00:00Z"},{id:"2",word:"huis",exercise:"Words · Reverse",result:"Good",at:"2026-09-27T10:00:00Z"}]} onClose={()=>{}}/>);
 expect(screen.getAllByRole("listitem")).toHaveLength(2);expect(screen.getByText("Words · Reverse")).toBeTruthy();
});
test("translation preview has one sentence direction and words can reverse",()=>{
 const translation=previewExercise({...run,draft:{...run.draft,types:["Translation"],directions:["Direct","Reverse"]}},0);
 expect(translation.prompt).toBe("I cycle to work.");expect(translation.answer).toBe("Ik ga met de fiets naar mijn werk.");
 const direct=previewExercise(run,0),reverse=previewExercise({...run,draft:{...run.draft,directions:["Reverse"]}},0);
 expect(reverse.prompt).toBe(direct.answer);expect(reverse.answer).toBe(direct.prompt);
});

test("article waits for panel entry and expands only the current third meaning",()=>{
 const p=props({run:{...run,draft:{...run.draft,size:20}}});render(<TrainingSessionPrototype {...p}/>);
 for(let i=0;i<17;i++){fireEvent.click(screen.getByRole("button",{name:"Show answer"}));fireEvent.click(screen.getByRole("button",{name:"Good"}));}
 const exercise=previewExercise(p.run,17);expect(exercise.meaning.displayOrdinal).toBe(3);
 fireEvent.click(screen.getByRole("button",{name:"Open word details"}));
 const dialog=screen.getByRole("dialog",{name:"Word details"});
 const senses=()=>within(dialog).getAllByRole("button").filter(el=>/^\d /.test(el.getAttribute("aria-label")||""));
 expect(senses().map(el=>el.getAttribute("aria-expanded"))).toEqual(["false","false","false"]);
 fireEvent.animationEnd(senses()[0]);
 expect(senses().every(el=>el.getAttribute("aria-expanded")==="false")).toBe(true);
 fireEvent.animationEnd(dialog);
 expect(senses().map(el=>el.getAttribute("aria-expanded"))).toEqual(["false","false","true"]);
 fireEvent.click(senses()[2]);fireEvent.animationEnd(dialog);
 expect(senses()[2].getAttribute("aria-expanded")).toBe("false");
});

test("headword translation stays with the fixed identity in both word directions",()=>{
 for(const direction of ["Direct","Reverse"] as const){
  const p=props({run:{...run,draft:{...run.draft,directions:[direction],size:20}}});
  const view=render(<TrainingSessionPrototype {...p}/>);
  for(let i=0;i<5;i++){fireEvent.click(screen.getByRole("button",{name:"Show answer"}));fireEvent.click(screen.getByRole("button",{name:"Good"}));}
  fireEvent.click(screen.getByRole("button",{name:"Show answer"}));fireEvent.click(screen.getByRole("button",{name:"Show translations"}));
  const translation=screen.getByText("good",{exact:true});const body=screen.getByLabelText("Answer details");
  expect(body.contains(translation)).toBe(false);
  expect(within(body).getByText("Something that is good is of high quality.")).toBeTruthy();
  view.unmount();
 }
});

test("grading waits for question movement and becomes available when it finishes",()=>{
 const animation={onfinish:null as null|(()=>void),cancel:vi.fn()};
 const animate=vi.fn().mockReturnValue(animation);
 Object.defineProperty(HTMLElement.prototype,"animate",{configurable:true,value:animate});
 try{
  const p=props();render(<TrainingSessionPrototype {...p}/>);
  fireEvent.click(screen.getByRole("button",{name:"Show answer"}));
  expect(animate).toHaveBeenCalledOnce();
  expect(animate.mock.calls[0][1]).toMatchObject({fill:"backwards"});
  expect(screen.getByRole("heading",{level:1}).parentElement?.getAttribute("data-moving")).toBe("true");
  expect((screen.getByRole("button",{name:"Good"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Good"}));expect(p.onAction).not.toHaveBeenCalled();
  act(()=>animation.onfinish?.());
  expect(screen.getByRole("heading",{level:1}).parentElement?.getAttribute("data-moving")).toBe("false");
  fireEvent.click(screen.getByRole("button",{name:"Good"}));expect(p.onAction).toHaveBeenCalledOnce();expect(animation.cancel).toHaveBeenCalled();
 }finally{delete (HTMLElement.prototype as Partial<HTMLElement>).animate;}
});

test("reduced motion opens the current sense without waiting for an animation event",()=>{
 const original=window.matchMedia;window.matchMedia=vi.fn().mockReturnValue({matches:true});
 try{
  render(<TrainingSessionPrototype {...props()}/>);fireEvent.click(screen.getByRole("button",{name:"Open word details"}));
  const dialog=screen.getByRole("dialog",{name:"Word details"});
  expect(within(dialog).getByRole("button",{name:/^1 een vervoermiddel/}).getAttribute("aria-expanded")).toBe("true");
 }finally{window.matchMedia=original;}
});

test("Exclude offers two distinct reversible marks, while Report is separate",()=>{
 const p=props();render(<TrainingSessionPrototype {...p}/>);
 fireEvent.click(screen.getByRole("button",{name:"Exclude"}));
 const menu=screen.getByRole("menu");expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
 expect(within(menu).queryByRole("menuitem",{name:"Report"})).toBeNull();
 fireEvent.click(within(menu).getByRole("menuitem",{name:"Mark as known"}));
 expect(screen.getByText("Marked as known")).toBeTruthy();expect(screen.queryByRole("button",{name:"Show answer"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Undo"}));expect(screen.getByRole("button",{name:"Show answer"})).toBeTruthy();expect(p.onAction).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Exclude"}));fireEvent.click(screen.getByRole("menuitem",{name:"Exclude"}));
 expect(screen.getByText("Excluded from training")).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Next card"}));
 expect(p.onAction.mock.calls[0][0].result).toBe("Excluded");expect(p.onProgress).toHaveBeenCalledWith(1);
 fireEvent.click(screen.getByRole("button",{name:"Report"}));
 expect(screen.getByRole("dialog",{name:"Report"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Preview report"}));expect(p.onAction).toHaveBeenCalledTimes(1);expect(screen.getByText(/demo report, nothing sent/)).toBeTruthy();
});
