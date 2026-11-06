import React, { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
 const dialog=screen.getByRole("dialog",{name:"Как часто встречаются слова"});
 for(const value of ["0","101","1.5",""]){fireEvent.change(within(dialog).getByRole("spinbutton",{name:"От"}),{target:{value}});expect(within(dialog).getByRole("button",{name:"Готово"})).toBeDisabled();}
 fireEvent.click(within(dialog).getByRole("button",{name:"Отмена"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 1–100"})).toHaveFocus();
});
test("custom bounds remain exact and can select a single rank",()=>{
 render(<Fields/>);fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));const dialog=screen.getByRole("dialog",{name:"Как часто встречаются слова"});
 for(const label of ["От","До"])fireEvent.change(within(dialog).getByRole("spinbutton",{name:label}),{target:{value:"73"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 73–73"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Изменить диапазон: 73–73"})).toHaveTextContent("73–73");
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
 const dialog=screen.getByRole("dialog",{name:"Как часто встречаются слова"});
 expect(within(dialog).getAllByRole("spinbutton")).toHaveLength(2);
 fireEvent.click(within(dialog).getByRole("button",{name:"10"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Увеличить начало"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Увеличить конец"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 1–100"})).toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(screen.getByRole("button",{name:"Изменить диапазон: 11–110"})).toBeInTheDocument();
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
 const dialog=screen.getByRole("dialog",{name:"Как часто встречаются слова"});
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
test("range edits notify the parent only on confirmation",()=>{
 const change=vi.fn();
 render(<VocabularySelectionFields value={{...DEFAULT_VOCABULARY_SELECTION,mode:"frequency"}} onChange={change} language="ru"/>);
 fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 let dialog=screen.getByRole("dialog",{name:"Как часто встречаются слова"});
 expect(within(dialog).queryByText("Способ настройки")).not.toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button",{name:"Увеличить конец"}));
 fireEvent.change(within(dialog).getByRole("spinbutton",{name:"От"}),{target:{value:"20"}});
 expect(change).not.toHaveBeenCalled();
 fireEvent.click(within(dialog).getByRole("button",{name:"Отмена"}));
 expect(change).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Изменить диапазон: 1–100"}));
 dialog=screen.getByRole("dialog",{name:"Как часто встречаются слова"});
 fireEvent.change(within(dialog).getByRole("spinbutton",{name:"От"}),{target:{value:"20"}});
 expect(change).not.toHaveBeenCalled();
 fireEvent.click(within(dialog).getByRole("button",{name:"Готово"}));
 expect(change).toHaveBeenCalledTimes(1);
 expect(change).toHaveBeenCalledWith(expect.objectContaining({from:20,to:100}));
});
