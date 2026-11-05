import React, { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { VocabularySelectionFields } from "@/components/practice/vocabulary/VocabularySelectionFields";
import { MaterialKindSelection } from "@/components/practice/vocabulary/MaterialKindSelection";
import type { VocabularyMaterialKind } from "@/lib/vocabulary/selection";
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
 for(const value of ["0","101","1.5",""]){fireEvent.change(within(dialog).getByRole("spinbutton",{name:"От"}),{target:{value}});expect(within(dialog).getByRole("button",{name:"Готово"})).toBeDisabled();}
 fireEvent.click(within(dialog).getByRole("button",{name:"Отмена"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 1–100"})).toHaveFocus();
});
test("custom bounds remain exact and can select a single rank",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 for(const label of ["От","До"])fireEvent.change(within(dialog).getByRole("spinbutton",{name:label}),{target:{value:"73"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 73–73"})).toBeInTheDocument();
 for(const name of ["От","До"])expect(screen.getByRole("spinbutton",{name})).toHaveAttribute("aria-valuenow","73");
});
test("all words hides frequency controls and preserves the meaning limit",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Все слова"}));
 expect(screen.queryByRole("spinbutton",{name:"От"})).not.toBeInTheDocument();
 expect(screen.getByRole("slider",{name:"Значений на статью"})).toHaveAttribute("aria-valuetext","Первые 2 значения");
});
test("the icon sort trigger names its selection and restores focus",()=>{
 const change=vi.fn();function Sort(){const [value,setValue]=useState<LibrarySort>("alphabetical");return <LibrarySortControl value={value} language="ru" onChange={next=>{change(next);setValue(next);}}/>;}
 render(<Sort/>);const trigger=screen.getByRole("button",{name:"Сортировка: По алфавиту"});expect(trigger).toHaveTextContent("");fireEvent.click(trigger);
 fireEvent.click(screen.getByRole("menuitem",{name:"По частоте в разговоре"}));expect(change).toHaveBeenCalledWith("spoken");
 expect(screen.getByRole("button",{name:"Сортировка: По частоте в разговоре"})).toHaveFocus();expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("inline wheels replace the rail and can separate equal boundaries in either direction",()=>{
 render(<Fields/>);const edit=screen.getByRole("button",{name:"Изменить диапазон: 1–100"});
 expect(edit).toHaveTextContent("");
 expect(screen.getAllByRole("slider")).toHaveLength(1);
 fireEvent.click(edit);const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 for(const label of ["От","До"])fireEvent.change(within(dialog).getByRole("spinbutton",{name:label}),{target:{value:"73"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 const from=screen.getByRole("spinbutton",{name:"От"}),to=screen.getByRole("spinbutton",{name:"До"});
 fireEvent.keyDown(from,{key:"ArrowDown"});
 expect(from).toHaveAttribute("aria-valuenow","72");expect(to).toHaveAttribute("aria-valuenow","73");
 fireEvent.keyDown(from,{key:"ArrowUp"});fireEvent.keyDown(to,{key:"ArrowUp"});
 expect(from).toHaveAttribute("aria-valuenow","73");expect(to).toHaveAttribute("aria-valuenow","74");
});

test("inline wheels keep the selected step, clamp bounds and cancel exact edits",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"100"}));
 const from=screen.getByRole("spinbutton",{name:"От"}),to=screen.getByRole("spinbutton",{name:"До"});
 fireEvent.keyDown(from,{key:"ArrowUp"});expect(from).toHaveAttribute("aria-valuenow","100");
 fireEvent.keyDown(to,{key:"ArrowUp"});expect(to).toHaveAttribute("aria-valuenow","200");
 fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 100–200"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 fireEvent.change(within(dialog).getByRole("spinbutton",{name:"От"}),{target:{value:"150"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Отмена"}));
 expect(from).toHaveAttribute("aria-valuenow","100");
 expect(screen.getByRole("button",{name:"100"})).toHaveAttribute("aria-pressed","true");
});

test("sort help explains missing frequency once above the choices",()=>{
 render(<LibrarySortControl value="alphabetical" onChange={()=>{}} language="ru"/>);
 fireEvent.click(screen.getByRole("button",{name:"Сортировка: По алфавиту"}));
 const menu=screen.getByRole("menu",{name:"Сортировка"});expect(menu).toHaveTextContent("Не у всех слов известна частота употребления.");expect(menu).not.toHaveTextContent(/CGN|SoNaR|пока не меняется/);
});

test("meaning guidance uses paragraphs and is not permanently repeated below the slider",()=>{
 render(<Fields/>);
 expect(screen.queryByText("У каждой отдельной статьи берём первые 2 значения. Если их меньше, берём все.")).not.toBeInTheDocument();
 const help=screen.getByRole("button",{name:"? Значений на статью"});
 const popup=document.getElementById(help.getAttribute("aria-controls")!)!;
 expect(popup.querySelectorAll("p")).toHaveLength(3);
 expect(popup).toHaveTextContent("Например, lopen");
 expect(popup).toHaveTextContent("Третье вместо них не добавляем");
});
test("button adjustment changes exact values without typing and applies only on Done",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 fireEvent.click(within(dialog).getByRole("button",{name:"Кнопки"}));
 expect(within(dialog).getAllByRole("spinbutton")).toHaveLength(2);
 fireEvent.click(within(dialog).getByRole("button",{name:"10"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Увеличить начало"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Увеличить конец"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 1–100"})).toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 11–110"})).toBeInTheDocument();
});
test("two sliders can be refined by one without opening a numeric field",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});fireEvent.click(within(dialog).getByRole("button",{name:"Две шкалы"}));
 expect(within(dialog).queryByRole("spinbutton")).not.toBeInTheDocument();
 fireEvent.change(within(dialog).getByRole("slider",{name:"Шкала начала диапазона"}),{target:{value:"1"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Увеличить начало"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 51–100"})).toBeInTheDocument();
});
test("entry types offer only confirmed groups, independently of parts of speech",()=>{
 function Kinds(){const [value,setValue]=useState<VocabularyMaterialKind[]>([]);return <MaterialKindSelection value={value} onChange={setValue} language="ru"/>;}
 render(<Kinds/>);expect(screen.getByRole("button",{name:"Любые"})).toHaveAttribute("aria-pressed","true");
 fireEvent.click(screen.getByRole("button",{name:"Другое"}));
 expect(screen.getByRole("button",{name:"Другое"})).toHaveAttribute("aria-pressed","true");
 expect(screen.getByRole("button",{name:"Слова"})).toHaveAttribute("aria-pressed","false");
 expect(screen.queryByRole("button",{name:"Предложения"})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Слова"}));
 expect(screen.getByRole("button",{name:"Слова"})).toHaveAttribute("aria-pressed","true");
 fireEvent.click(screen.getByRole("button",{name:"Другое"}));
 expect(screen.getByRole("button",{name:"Другое"})).toHaveAttribute("aria-pressed","true");
 expect(screen.getByRole("button",{name:"Любые"})).toHaveAttribute("aria-pressed","false");
});
test("buttons and typing share the exact draft and selected step",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 fireEvent.change(within(dialog).getByRole("spinbutton",{name:"От"}),{target:{value:"20"}});
 fireEvent.change(within(dialog).getByRole("spinbutton",{name:"До"}),{target:{value:"200"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"100"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Увеличить начало"}));
 expect(within(dialog).getByRole("spinbutton",{name:"От"})).toHaveValue(120);
 fireEvent.click(within(dialog).getByRole("button",{name:"Увеличить начало"}));
 expect(within(dialog).getByRole("spinbutton",{name:"От"})).toHaveValue(200);
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 200–200"})).toBeInTheDocument();
});
test("wheels support keys and scrolling, clamp bounds and preserve the draft across modes",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 fireEvent.click(within(dialog).getByRole("button",{name:"Колёсики"}));
 const start=within(dialog).getByRole("spinbutton",{name:"От"}),end=within(dialog).getByRole("spinbutton",{name:"До"});
 fireEvent.keyDown(start,{key:"ArrowDown"});expect(start).toHaveAttribute("aria-valuenow","1");
 fireEvent.keyDown(start,{key:"ArrowUp"});expect(start).toHaveAttribute("aria-valuenow","2");
 fireEvent.click(within(dialog).getByRole("button",{name:"100"}));
 fireEvent.wheel(start,{deltaY:32});expect(start).toHaveAttribute("aria-valuenow","100");
 fireEvent.keyDown(end,{key:"ArrowDown"});expect(end).toHaveAttribute("aria-valuenow","100");
 fireEvent.keyDown(end,{key:"ArrowUp"});expect(end).toHaveAttribute("aria-valuenow","200");
 fireEvent.click(within(dialog).getByRole("button",{name:"Кнопки"}));
 expect(within(dialog).getByRole("spinbutton",{name:"От"})).toHaveValue(100);
 expect(within(dialog).getByRole("spinbutton",{name:"До"})).toHaveValue(200);
 fireEvent.click(within(dialog).getByRole("button",{name:"Отмена"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 1–100"})).toBeInTheDocument();
});
test("wheel drag and tapping nearby values use the selected step",()=>{
 class Pointer extends MouseEvent {readonly pointerId=1;readonly isPrimary=true;}
 vi.stubGlobal("PointerEvent",Pointer);
 Object.defineProperty(HTMLElement.prototype,"setPointerCapture",{configurable:true,writable:true,value:vi.fn()});
 Object.defineProperty(HTMLElement.prototype,"hasPointerCapture",{configurable:true,writable:true,value:()=>false});
 const view=render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 fireEvent.click(within(dialog).getByRole("button",{name:"10"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Колёсики"}));
 const wheel=within(dialog).getByRole("spinbutton",{name:"От"});
 vi.spyOn(wheel,"getBoundingClientRect").mockReturnValue({left:0,width:100,right:100,top:0,bottom:160,height:160,x:0,y:0,toJSON:()=>({})});
 fireEvent.pointerDown(wheel,{clientY:80,button:0});fireEvent.pointerMove(wheel,{clientY:16,button:0});fireEvent.pointerUp(wheel,{clientY:16,button:0});
 expect(wheel).toHaveAttribute("aria-valuenow","21");
 fireEvent.pointerDown(wheel,{clientY:16,button:0});fireEvent.pointerUp(wheel,{clientY:16,button:0});
 expect(wheel).toHaveAttribute("aria-valuenow","1");
 fireEvent.click(within(dialog).getByRole("button",{name:"Отмена"}));
 const compact=screen.getByRole("spinbutton",{name:"От"});
 vi.spyOn(compact,"getBoundingClientRect").mockReturnValue({left:0,width:100,right:100,top:0,bottom:96,height:96,x:0,y:0,toJSON:()=>({})});
 fireEvent.pointerDown(compact,{clientY:80,button:0});fireEvent.pointerUp(compact,{clientY:80,button:0});
 expect(compact).toHaveAttribute("aria-valuenow","2");
 view.unmount();vi.unstubAllGlobals();
});

test("batched native wheel events retain every increment",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 fireEvent.click(within(dialog).getByRole("button",{name:"Колёсики"}));
 const wheel=within(dialog).getByRole("spinbutton",{name:"От"});
 act(()=>{for(let n=0;n<3;n++)wheel.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));});
 expect(wheel).toHaveAttribute("aria-valuenow","4");
});

test("batched events on both inline wheels retain both boundary changes",()=>{
 render(<Fields/>);const from=screen.getByRole("spinbutton",{name:"От"}),to=screen.getByRole("spinbutton",{name:"До"});
 act(()=>{
  from.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));
  to.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));
 });
 expect(from).toHaveAttribute("aria-valuenow","2");expect(to).toHaveAttribute("aria-valuenow","101");
});

test("batched sibling clamps are acknowledged before the next wheel tick",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"100"}));
 const from=screen.getByRole("spinbutton",{name:"От"}),to=screen.getByRole("spinbutton",{name:"До"});
 act(()=>{
  from.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));
  to.dispatchEvent(new WheelEvent("wheel",{deltaY:-32,bubbles:true,cancelable:true}));
  to.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));
 });
 expect(from).toHaveAttribute("aria-valuenow","100");expect(to).toHaveAttribute("aria-valuenow","200");
 fireEvent.wheel(to,{deltaY:-32});
 act(()=>{
  to.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));
  from.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));
 });
 expect(from).toHaveAttribute("aria-valuenow","200");expect(to).toHaveAttribute("aria-valuenow","200");
});
test("modal wheels also merge and acknowledge sibling clamps",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 const dialog=screen.getByRole("dialog",{name:"Места в списке"});
 fireEvent.click(within(dialog).getByRole("button",{name:"Колёсики"}));fireEvent.click(within(dialog).getByRole("button",{name:"100"}));
 const from=within(dialog).getByRole("spinbutton",{name:"От"}),to=within(dialog).getByRole("spinbutton",{name:"До"});
 act(()=>{
  from.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));
  to.dispatchEvent(new WheelEvent("wheel",{deltaY:-32,bubbles:true,cancelable:true}));
  to.dispatchEvent(new WheelEvent("wheel",{deltaY:32,bubbles:true,cancelable:true}));
 });
 expect(from).toHaveAttribute("aria-valuenow","100");expect(to).toHaveAttribute("aria-valuenow","200");
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 100–200"})).toBeInTheDocument();
});
