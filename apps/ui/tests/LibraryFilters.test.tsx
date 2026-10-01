import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { LibraryFilters, type LibraryFilterDraft } from "@/components/practice/library/LibraryFilters";
const value:LibraryFilterDraft={languageCode:"nl",dictionaryId:null,parts:[],article:null};
const props={value,locale:"en" as const,languageOptions:[{id:"nl",label:"Dutch"},{id:"en",label:"English"}],sourceOptions:[{id:"source",label:"Real source"}],countContent:"3 matching articles"};
test("chips keep draft edits private; noun chevron opens a single nearby article picker",()=>{
 const apply=vi.fn(),close=vi.fn();render(<LibraryFilters {...props} onClose={close} onApply={apply}/>);
 fireEvent.click(screen.getByRole("button",{name:"Nouns"}));expect(screen.getByRole("button",{name:"Nouns"})).toHaveAttribute("aria-pressed","true");expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Noun subfilters"}));
 const pop=screen.getByRole("dialog",{name:"Noun article"});fireEvent.click(within(pop).getByRole("button",{name:"het"}));
 fireEvent.click(within(pop).getByRole("button",{name:"Close noun subfilters"}));
 fireEvent.click(screen.getByRole("button",{name:"Show results"}));expect(apply).toHaveBeenCalledWith({...value,parts:["noun"],article:"het"});
});
test("language/source navigation uses real IDs and Cancel never applies changes",()=>{
 const apply=vi.fn(),close=vi.fn();render(<LibraryFilters {...props} onClose={close} onApply={apply}/>);
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));fireEvent.click(screen.getByRole("button",{name:"Real source"}));fireEvent.click(screen.getByRole("button",{name:"OK"}));
 expect(screen.getByRole("button",{name:/^Source/})).toHaveTextContent("Real source");
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));expect(close).toHaveBeenCalledOnce();expect(apply).not.toHaveBeenCalled();
});
test("unavailable materials disable Apply while reset and language selection remain reachable",()=>{
 const apply=vi.fn();render(<LibraryFilters {...props} canApply={false} onClose={()=>{}} onApply={apply}/>);
 expect(screen.getByRole("button",{name:"Show results"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:/^Language/}));
 fireEvent.click(screen.getByRole("button",{name:"English"}));fireEvent.click(screen.getByRole("button",{name:"OK"}));
 expect(screen.queryByRole("button",{name:"Noun subfilters"})).not.toBeInTheDocument();expect(apply).not.toHaveBeenCalled();
});

beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
  Object.defineProperty(HTMLDialogElement.prototype, "close", {configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});

test("collection choice stays in draft, clears incompatible filters, and applies a real collection ID",()=>{
 const apply=vi.fn();render(<LibraryFilters {...props} value={{...value,parts:["noun"],article:"het"}} collectionOptions={[{id:"a",label:"My A"},{id:"b",label:"My B"}]} onClose={()=>{}} onApply={apply}/>);
 fireEvent.click(screen.getByRole("button",{name:/^Collections/}));
 fireEvent.click(screen.getByRole("button",{name:"My B"}));
 expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"OK"}));
 expect(screen.queryByRole("button",{name:"Nouns"})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenCalledWith({...value,applyListFilter:true,collectionId:"b"});
});
