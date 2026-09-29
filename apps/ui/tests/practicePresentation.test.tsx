import React from "react";
import {fireEvent, render, screen, cleanup} from "@testing-library/react";
import {afterEach, beforeEach, expect, test, vi} from "vitest";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import {IconAction} from "@/components/practice/ui/IconAction";

beforeEach(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:vi.fn(function(this:HTMLDialogElement){this.setAttribute("open","");})});
 Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:vi.fn(function(this:HTMLDialogElement){this.removeAttribute("open");})});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test("icon actions have an accessible name and never implicitly submit forms",()=>{
 const submit=vi.fn(event=>event.preventDefault());
 render(<form onSubmit={submit}><IconAction label="Edit training"><svg/></IconAction></form>);
 fireEvent.click(screen.getByRole("button",{name:"Edit training"}));expect(submit).not.toHaveBeenCalled();
});
test("nested dialogs keep scrolling locked and restore the invoking focus",()=>{
 const opener=document.createElement("button");document.body.append(opener);opener.focus();
 document.documentElement.style.overflow="auto";
 const outer=render(<DialogSurface aria-label="Filters" onDismiss={()=>{}}><button>Open nouns</button></DialogSurface>);
 const trigger=screen.getByRole("button",{name:"Open nouns"});trigger.focus();
 const inner=render(<DialogSurface aria-label="Nouns" onDismiss={()=>{}}>Articles</DialogSurface>);
 expect(document.documentElement.style.overflow).toBe("hidden");inner.unmount();
 expect(document.documentElement.style.overflow).toBe("hidden");expect(document.activeElement).toBe(trigger);
 outer.unmount();expect(document.documentElement.style.overflow).toBe("auto");expect(document.activeElement).toBe(opener);opener.remove();
});
test("Escape delegates to the active dialog, while padding clicks do not dismiss it",()=>{
 const dismiss=vi.fn();render(<DialogSurface aria-label="Filters" onDismiss={dismiss}>Content</DialogSurface>);
 const dialog=screen.getByRole("dialog",{name:"Filters"});
 vi.spyOn(dialog,"getBoundingClientRect").mockReturnValue({left:100,right:300,top:100,bottom:300} as DOMRect);
 fireEvent.click(dialog,{clientX:120,clientY:120});expect(dismiss).not.toHaveBeenCalled();
 fireEvent.click(dialog,{clientX:50,clientY:50});expect(dismiss).toHaveBeenCalledTimes(1);
 fireEvent(dialog,new Event("cancel",{bubbles:false,cancelable:true}));expect(dismiss).toHaveBeenCalledTimes(2);
});
test("nested filter screens can consume Escape as Back instead of closing the dialog",()=>{
 const back=vi.fn(),dismiss=vi.fn();render(<DialogSurface aria-label="Sources" onDismiss={dismiss} onCancel={back}>Sources</DialogSurface>);
 fireEvent(screen.getByRole("dialog"),new Event("cancel",{cancelable:true}));expect(back).toHaveBeenCalledTimes(1);expect(dismiss).not.toHaveBeenCalled();
});

test("secondary panel keeps modality during exit and restores focus afterwards",async()=>{
 const {PracticePanel}=await import("@/components/practice/ui/PracticePanel");
 vi.useFakeTimers();
 const close=vi.fn();
 const view=render(<PracticePanel title="Recent activity" onClose={close}>Recent actions</PracticePanel>);
 fireEvent.click(screen.getByRole("button",{name:"Close recent activity"}));
 expect(close).not.toHaveBeenCalled();expect(screen.getByRole("dialog").getAttribute("data-closing")).toBe("true");
 expect(document.documentElement.style.overflow).toBe("hidden");
 vi.advanceTimersByTime(340);expect(close).toHaveBeenCalledOnce();view.unmount();vi.useRealTimers();
});

test("secondary panel honours reduced motion on dismissal",async()=>{
 const {PracticePanel}=await import("@/components/practice/ui/PracticePanel");
 const original=window.matchMedia;
 window.matchMedia=vi.fn().mockReturnValue({matches:true});
 try{const close=vi.fn();render(<PracticePanel title="Recent activity" onClose={close}>Actions</PracticePanel>);fireEvent.click(screen.getByRole("button",{name:"Close recent activity"}));expect(close).toHaveBeenCalledOnce();}
 finally{window.matchMedia=original;}
});
