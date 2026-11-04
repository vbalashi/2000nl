import React from "react";
import { fireEvent,render,screen } from "@testing-library/react";
import { expect,test,vi } from "vitest";
import { TrainingCompletion } from "@/components/training/v2/TrainingCompletion";

test("shows saved active time and keeps the three action priorities",()=>{
 const next=vi.fn(),edit=vi.fn(),home=vi.fn();
 render(<TrainingCompletion interfaceLanguage="en" completedCount={10} activeMilliseconds={260000} onRestart={next} onEdit={edit} onExit={home}/>);
 expect(screen.getByText("10 cards · 4 min 20 sec")).toBeVisible();
 const buttons=screen.getAllByRole("button");
 expect(buttons.map(b=>b.textContent)).toEqual(["Another 10 cards","Modify training","Back to home"]);
 buttons.forEach(button=>fireEvent.click(button));
 expect(next).toHaveBeenCalledOnce(); expect(edit).toHaveBeenCalledOnce(); expect(home).toHaveBeenCalledOnce();
});
test("missing time is omitted and pending launch fences duplicate actions",()=>{
 render(<TrainingCompletion interfaceLanguage="ru" completedCount={10} pending onRestart={vi.fn()} onEdit={vi.fn()} onExit={vi.fn()}/>);
 expect(screen.getByText("10 карточек")).toBeVisible();
 expect(screen.queryByText(/0 мин/)).toBeNull();
 screen.getAllByRole("button").forEach(button=>expect(button).toBeDisabled());
});
test('empty terminal preserves shared visual surface and truthful actions without count or completion success',()=>{
 render(<TrainingCompletion empty interfaceLanguage="ru" completedCount={0} activeMilliseconds={0} onRestart={vi.fn()} onEdit={vi.fn()} onExit={vi.fn()}/>);
 expect(screen.getByTestId('training-completion')).toBeVisible();expect(screen.getByText('Нет доступных карточек')).toBeVisible();expect(screen.getByText('Сейчас нет доступных карточек для этой тренировки')).toBeVisible();
 expect(screen.queryByText('Сессия завершена')).toBeNull();expect(screen.queryByText('0 карточек')).toBeNull();expect(screen.getAllByRole('button').map(b=>b.textContent)).toEqual(['Изменить тренировку','На главный экран']);
});

test.each([['en','No cards available'],['nl','Geen kaarten beschikbaar'],['ru','Нет доступных карточек']] as const)('empty terminal localizes %s and fences all actions while pending',(language,title)=>{
 render(<TrainingCompletion empty interfaceLanguage={language} completedCount={0} pending onRestart={vi.fn()} onEdit={vi.fn()} onExit={vi.fn()}/>);expect(screen.getByText(title)).toBeVisible();expect(screen.getAllByRole('button')).toHaveLength(2);screen.getAllByRole('button').forEach(b=>expect(b).toBeDisabled());
});


test.each([
 ["en", 5, "Another 5 cards"], ["nl", 20, "Nog 20 kaarten"],
 ["ru", 1, "Ещё 1 карточка"], ["ru", 22, "Ещё 22 карточки"],
 ["en", "all-due-today", "Start another session"],
 ["nl", "all-due-today", "Volgende sessie starten"],
 ["ru", "all-due-today", "Начать следующую сессию"],
] as const)("localizes restart for %s and %s", (language, size, label) => {
 render(<TrainingCompletion interfaceLanguage={language} sessionSize={size} completedCount={3} onRestart={vi.fn()} onExit={vi.fn()}/>);
 expect(screen.getByRole("button", {name: label})).toBeVisible();
});
