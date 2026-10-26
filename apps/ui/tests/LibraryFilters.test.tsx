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
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));fireEvent.click(screen.getByRole("button",{name:"Real source"}));
 expect(screen.getByRole("button",{name:/^Source/})).toHaveTextContent("Real source");
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));expect(close).toHaveBeenCalledOnce();expect(apply).not.toHaveBeenCalled();
});
test("unavailable materials disable Apply while reset and language selection remain reachable",()=>{
 const apply=vi.fn();render(<LibraryFilters {...props} canApply={false} onClose={()=>{}} onApply={apply}/>);
 expect(screen.getByRole("button",{name:"Show results"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"English"}));
 expect(screen.queryByRole("button",{name:"Noun subfilters"})).not.toBeInTheDocument();expect(apply).not.toHaveBeenCalled();
});

beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
  Object.defineProperty(HTMLDialogElement.prototype, "close", {configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});

test("collection choice preserves POS/article filters and applies a real collection ID",()=>{
 const apply=vi.fn();render(<LibraryFilters {...props} value={{...value,parts:["noun"],article:"het"}} collectionOptions={[{id:"a",label:"My A"},{id:"b",label:"My B"}]} onClose={()=>{}} onApply={apply}/>);
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));
 fireEvent.click(screen.getByRole("button",{name:"My B"}));
 expect(apply).not.toHaveBeenCalled();

 expect(screen.getByRole("button",{name:/^Nouns/})).toHaveAttribute("aria-pressed","true");
 fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenCalledWith({...value,parts:["noun"],article:"het",applyListFilter:true,collectionId:"b",labelId:null,labelName:null});
});

 test("dictionary and collection sources with the same ID remain distinct",()=>{
 const apply=vi.fn();render(<LibraryFilters {...props} value={{...value,applyListFilter:true,collectionId:"source"}} collectionOptions={[{id:"source",label:"Real collection"}]} onClose={()=>{}} onApply={apply}/>);
 expect(screen.queryByRole("button",{name:/^Collections/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));
 expect(screen.getByRole("button",{name:"Real collection"})).toHaveAttribute("aria-pressed","true");
 fireEvent.click(screen.getByRole("button",{name:"Real source"}));

 fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenCalledWith({...value,dictionaryId:"source",applyListFilter:false,collectionId:null,labelId:null,labelName:null});
 });

test("inline source search preserves single selection and language change clears source scope",()=>{
 const apply=vi.fn();render(<LibraryFilters {...props} onClose={()=>{}} onApply={apply}/>);
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));
 fireEvent.click(screen.getByRole("button",{name:"Search sources"}));
 fireEvent.change(screen.getByRole("textbox",{name:"Search sources"}),{target:{value:"real"}});
 expect(screen.queryByRole("button",{name:"All dictionaries"})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Real source"}));
 expect(screen.getByRole("button",{name:"Real source"})).toHaveAttribute("aria-pressed","true");
 fireEvent.click(screen.getByRole("button",{name:"English"}));
 expect(screen.getByRole("textbox",{name:"Search sources"})).toHaveValue("");
 fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenCalledWith({...value,languageCode:"en",dictionaryId:null,collectionId:null,applyListFilter:false,labelId:null,labelName:null});
});

test("opening organization suspends the filter dialog without applying or losing its draft", async () => {
 const {LibraryPresentationContext}=await import("@/components/practice/library/LibraryPresentationContext");
 const apply=vi.fn(),close=vi.fn(),organize=vi.fn();
 const view=(organizerOpen:boolean)=><LibraryPresentationContext.Provider value={{organizerOpen,renderSourceActions:()=> <button type="button" onClick={organize}>Organize collections</button>}}><LibraryFilters {...props} onClose={close} onApply={apply}/></LibraryPresentationContext.Provider>;
 const {rerender}=render(view(false));
 fireEvent.click(screen.getByRole("button",{name:"Nouns"}));
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));
 fireEvent.click(screen.getByRole("button",{name:"Organize collections"}));
 expect(organize).toHaveBeenCalledOnce();
 rerender(view(true));
 expect(screen.queryByRole("dialog",{name:"Library filters"})).not.toBeInTheDocument();
 expect(apply).not.toHaveBeenCalled();
 rerender(view(false));
 expect(screen.getByRole("dialog",{name:"Library filters"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Nouns"})).toHaveAttribute("aria-pressed","true");
 expect(screen.getByRole("button",{name:"Organize collections"})).toBeInTheDocument();
 expect(close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenCalledWith({...value,parts:["noun"]});
});

test("collection switches preserve multi-POS/article; language and noun removal invalidate only the relevant selection",()=>{
 const apply=vi.fn();render(<LibraryFilters {...props} value={{...value,applyListFilter:true,collectionId:"a",parts:["noun","verb"],article:"de"}} collectionOptions={[{id:"a",label:"A"},{id:"b",label:"B"}]} onClose={()=>{}} onApply={apply}/>);
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));fireEvent.click(screen.getByRole("button",{name:"B"}));
 fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({collectionId:"b",parts:["noun","verb"],article:"de"}));
 fireEvent.click(screen.getByRole("button",{name:/^Nouns/}));fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({collectionId:"b",parts:["verb"],article:null}));
 fireEvent.click(screen.getByRole("button",{name:"English"}));fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({languageCode:"en",applyListFilter:false,collectionId:null,parts:["verb"],article:null}));
});


test("label source is distinct from collection and preserves manual POS/article filters",()=>{
 const apply=vi.fn();
 render(<LibraryFilters {...props} value={{...value,parts:["noun","verb"],article:"de",collectionId:"same",applyListFilter:true}}
   labelOptions={[{id:"same",label:"YouTube / Easy Dutch"}]} collectionOptions={[{id:"same",label:"Lesson"}]} onClose={()=>{}} onApply={apply}/>);
 fireEvent.click(screen.getByRole("button",{name:/^Source/}));
 fireEvent.click(screen.getByRole("button",{name:"YouTube / Easy Dutch"}));
 expect(screen.getByRole("button",{name:"YouTube / Easy Dutch"})).toHaveAttribute("aria-pressed","true");
 expect(screen.getByRole("button",{name:"Lesson"})).toHaveAttribute("aria-pressed","false");
 fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenLastCalledWith({...value,parts:["noun","verb"],article:"de",collectionId:null,applyListFilter:false,labelId:"same",labelName:"YouTube / Easy Dutch"});
 fireEvent.click(screen.getByRole("button",{name:"Lesson"}));
 fireEvent.click(screen.getByRole("button",{name:"Show results"}));
 expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({collectionId:"same",applyListFilter:true,labelId:null,labelName:null,parts:["noun","verb"],article:"de"}));
});
