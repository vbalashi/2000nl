import React, {useState} from "react";
import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, test} from "vitest";
import {VocabularySelectionFields} from "@/components/practice/vocabulary/VocabularySelectionFields";
import {DEFAULT_VOCABULARY_SELECTION, type VocabularySelection} from "@/lib/vocabulary/selection";

function Harness({learningLanguage="nl"}:{learningLanguage?:string}){
 const [value,setValue]=useState<VocabularySelection>({...DEFAULT_VOCABULARY_SELECTION,mode:"frequency"});
 return <><VocabularySelectionFields compact learningLanguage={learningLanguage} value={value} onChange={setValue} language="en"/><output data-testid="value">{JSON.stringify(value)}</output></>;
}
test("quick ranges and meaning choices update the real selection without changing unrelated settings",()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByRole("button",{name:"Top 300"}));
 expect(JSON.parse(screen.getByTestId("value").textContent!)).toMatchObject({from:1,to:300,profile:"spoken",meanings:"all"});
 const meanings=screen.getByRole("group",{name:"Meanings per entry"});
 fireEvent.click(within(meanings).getByRole("button",{name:"First 2 meanings"}));
 expect(JSON.parse(screen.getByTestId("value").textContent!)).toMatchObject({from:1,to:300,meanings:2});
 expect(within(meanings).getByRole("button",{name:"First meaning"})).toHaveAttribute("aria-pressed","true");
 expect(within(meanings).getByRole("button",{name:"First 3 meanings"})).toHaveAttribute("aria-pressed","false");
 fireEvent.click(within(meanings).getByRole("button",{name:"First 5 meanings"}));
 expect(JSON.parse(screen.getByTestId("value").textContent!).meanings).toBe(5);
 expect(within(meanings).getByRole("button",{name:"First 4 meanings"})).toHaveAttribute("aria-pressed","true");
 fireEvent.click(within(meanings).getByRole("button",{name:"First 4 meanings"}));
 expect(within(meanings).getByRole("button",{name:"First 5 meanings"})).toHaveAttribute("aria-pressed","false");
 fireEvent.click(within(meanings).getByRole("button",{name:"All meanings"}));
 expect(JSON.parse(screen.getByTestId("value").textContent!).meanings).toBe("all");
});

test('frequency provenance is shown only for the Dutch word language',()=>{
 const {rerender}=render(<Harness learningLanguage="nl"/>);
 fireEvent.click(screen.getByRole('button',{name:'? Places in the list'}));
 expect(screen.getByText(/Dutch frequency rankings use CGN and SoNaR/)).toBeInTheDocument();
 rerender(<Harness learningLanguage="en"/>);
 expect(screen.queryByText(/Dutch frequency rankings use CGN and SoNaR/)).not.toBeInTheDocument();
});

test('frequency controls close accessibly and retain the selected range when reopened',()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByRole('button',{name:'Top 300'}));
 const frequency=screen.getByRole('group',{name:'Where they occur'}).closest('[aria-hidden]')!;
 fireEvent.click(screen.getByRole('button',{name:'All words'}));
 expect(frequency).toHaveAttribute('aria-hidden','true');
 expect(frequency).toHaveAttribute('inert');
 expect(screen.queryByRole('button',{name:'Top 300'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'By frequency'}));
 expect(frequency).not.toHaveAttribute('inert');
 expect(screen.getByRole('button',{name:'Top 300'})).toHaveAttribute('aria-pressed','true');
});

test('frequency choices use the same icons as the Library sorting control',()=>{
 render(<Harness/>);
 expect(screen.getByRole('button',{name:'Spoken'}).querySelector('svg.lucide-message-circle')).not.toBeNull();
 expect(screen.getByRole('button',{name:'Written'}).querySelector('svg.lucide-file-text')).not.toBeNull();
});
