import React, { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { VocabularySelectionFields } from "@/components/practice/vocabulary/VocabularySelectionFields";
import { LibrarySortControl, type LibrarySort } from "@/components/practice/library/LibrarySortControl";
import { DEFAULT_VOCABULARY_SELECTION, type VocabularySelection } from "@/lib/vocabulary/selection";
beforeEach(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
 Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});
function Fields(){const [value,setValue]=useState<VocabularySelection>({...DEFAULT_VOCABULARY_SELECTION,mode:"frequency",meanings:2});return <VocabularySelectionFields value={value} onChange={setValue} language="ru"/>;}
test("the meaning slider runs from one to all",()=>{
 render(<Fields/>);const slider=screen.getByRole("slider",{name:"Значений на статью"});
 expect(slider).toHaveValue("1");expect(slider).toHaveAttribute("aria-valuetext","Первые 2 значения");
 fireEvent.change(slider,{target:{value:"0"}});expect(slider).toHaveAttribute("aria-valuetext","Первое значение");
 fireEvent.change(slider,{target:{value:"3"}});expect(slider).toHaveAttribute("aria-valuetext","Все значения");
});
test("exact bounds reject zero and reversed ranges; cancelling restores the opener",()=>{
 render(<Fields/>);const open=screen.getByRole("button",{name:"Изменить диапазон: 1–100"});open.focus();fireEvent.click(open);
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 for(const value of ["0","101","1.5",""]){fireEvent.change(within(dialog).getByLabelText("От"),{target:{value}});expect(within(dialog).getByRole("button",{name:"Готово"})).toBeDisabled();}
 fireEvent.click(within(dialog).getByRole("button",{name:"Отмена"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 1–100"})).toHaveFocus();
});
test("custom bounds remain exact and can select a single rank",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 for(const label of ["От","До"])fireEvent.change(within(dialog).getByLabelText(label),{target:{value:"73"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 73–73"})).toBeInTheDocument();
 for(const name of ["Первая граница диапазона","Последняя граница диапазона"])expect(screen.getByRole("slider",{name})).toHaveAttribute("aria-valuetext","73");
});
test("all words hides frequency controls and preserves the meaning limit",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Все слова"}));
 expect(screen.queryByRole("slider",{name:"Первая граница диапазона"})).not.toBeInTheDocument();
 expect(screen.getByRole("slider",{name:"Значений на статью"})).toHaveAttribute("aria-valuetext","Первые 2 значения");
});
test("the icon sort trigger names its selection and restores focus",()=>{
 const change=vi.fn();function Sort(){const [value,setValue]=useState<LibrarySort>("alphabetical");return <LibrarySortControl value={value} language="ru" onChange={next=>{change(next);setValue(next);}}/>;}
 render(<Sort/>);const trigger=screen.getByRole("button",{name:"Сортировка: По алфавиту"});expect(trigger).toHaveTextContent("");fireEvent.click(trigger);
 fireEvent.click(screen.getByRole("menuitem",{name:"По частоте в разговоре"}));expect(change).toHaveBeenCalledWith("spoken");
 expect(screen.getByRole("button",{name:"Сортировка: По частоте в разговоре"})).toHaveFocus();expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("either coincident boundary can be separated by a pointer drag",()=>{
 class Pointer extends MouseEvent {readonly pointerId=1;readonly isPrimary=true;}
 vi.stubGlobal("PointerEvent",Pointer);
 Object.defineProperty(HTMLElement.prototype,"setPointerCapture",{configurable:true,value:vi.fn()});
 Object.defineProperty(HTMLElement.prototype,"hasPointerCapture",{configurable:true,value:()=>false});
 const view=render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});for(const label of ["От","До"])fireEvent.change(within(dialog).getByLabelText(label),{target:{value:"73"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 const surface=screen.getByRole("slider",{name:"Первая граница диапазона"}).parentElement!;
 vi.spyOn(surface,"getBoundingClientRect").mockReturnValue({left:0,width:916,right:916,top:0,bottom:44,height:44,x:0,y:0,toJSON:()=>({})});
 fireEvent.pointerDown(surface,{clientX:208,button:0});fireEvent.pointerMove(surface,{clientX:108,button:0});fireEvent.pointerUp(surface,{clientX:108,button:0});
 expect(screen.getByRole("slider",{name:"Первая граница диапазона"})).toHaveAttribute("aria-valuetext","50");
 expect(screen.getByRole("slider",{name:"Последняя граница диапазона"})).toHaveAttribute("aria-valuetext","73");
 // Recreate the coincident state and move the other way.
 fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 50–73"}));
 fireEvent.change(screen.getByRole("dialog",{name:"Места в списке"}).querySelector("input")!,{target:{value:"73"}});
 fireEvent.click(screen.getByRole("button",{name:"Готово"}));
 fireEvent.pointerDown(surface,{clientX:208,button:0});fireEvent.pointerMove(surface,{clientX:308,button:0});fireEvent.pointerUp(surface,{clientX:308,button:0});
 expect(screen.getByRole("slider",{name:"Первая граница диапазона"})).toHaveAttribute("aria-valuetext","73");
 expect(screen.getByRole("slider",{name:"Последняя граница диапазона"})).toHaveAttribute("aria-valuetext","100");
 expect(screen.getByRole("slider",{name:"Последняя граница диапазона"})).toHaveAttribute("min","2");
 view.unmount();vi.unstubAllGlobals();
});

test("the sort review limitation is available before opening the menu",()=>{
 render(<LibrarySortControl value="alphabetical" onChange={()=>{}} language="ru" reviewNotice="Порядок слов пока не меняется"/>);
 expect(screen.getByRole("button",{name:"Сортировка: По алфавиту"})).toHaveAccessibleDescription("Порядок слов пока не меняется");
});
