import React from "react";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,test,vi} from "vitest";
import {TrainingKnownChoice} from "@/components/training/v2/TrainingKnownChoice";
import {fetchMeaningProgress} from "@/lib/platform/meaningProgressClient";
import {saveTrainingKnownChoice} from "@/lib/platform/trainingKnownChoiceClient";
import type {MeaningLearningProgress} from "../../../packages/shared/types/meaningLearningProgress";
vi.mock("@/lib/platform/meaningProgressClient",()=>({fetchMeaningProgress:vi.fn()}));
vi.mock("@/lib/platform/trainingKnownChoiceClient",()=>({saveTrainingKnownChoice:vi.fn()}));
const progress={entryId:"entry",revision:"a".repeat(64),exclusionId:null,directions:[{cardTypeId:"word-to-definition",knownMarkId:null},{cardTypeId:"definition-to-word",knownMarkId:"existing"}]} as MeaningLearningProgress;
function mount(){const onBack=vi.fn(),onAccepted=vi.fn(async()=>{});render(<TrainingKnownChoice entryId="entry" sessionId="session" direction="word-to-definition" headword="bank" definition="een zitmeubel voor meerdere mensen" language="ru" contentLanguage="nl" onBack={onBack} onAccepted={onAccepted}/>);return {onBack,onAccepted};}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(fetchMeaningProgress).mockResolvedValue(progress);vi.mocked(saveTrainingKnownChoice).mockResolvedValue(progress);});afterEach(cleanup);
test("stages current direction, preserves existing sibling and cancels without any write",async()=>{
 const {onBack}=mount();await screen.findAllByRole('button',{name:'Вернуть в обучение'});
 expect(screen.getAllByText('Уже знаю')).toHaveLength(2);
 fireEvent.click(screen.getAllByRole('button',{name:'Вернуть в обучение'})[1]);
 expect(screen.getByText('Ещё изучаю')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Вернуться назад'}));expect(onBack).toHaveBeenCalledOnce();expect(saveTrainingKnownChoice).not.toHaveBeenCalled();
});
test("Next submits exactly the chosen directions and advances only after acceptance",async()=>{
 const {onAccepted}=mount();await screen.findAllByRole('button',{name:'Вернуть в обучение'});
 fireEvent.click(screen.getAllByRole('button',{name:'Вернуть в обучение'})[1]);
 fireEvent.click(screen.getByRole('button',{name:'Далее'}));await waitFor(()=>expect(onAccepted).toHaveBeenCalledOnce());
 expect(saveTrainingKnownChoice).toHaveBeenCalledWith(expect.objectContaining({entryId:'entry',trainingSessionId:'session',knownDirections:['word-to-definition'],revision:progress.revision}));
});
test("uncertain retry freezes the exact intent, disables edits and does not advance on failure",async()=>{
 vi.mocked(saveTrainingKnownChoice).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(progress);
 const {onAccepted}=mount();await screen.findAllByRole('button',{name:'Вернуть в обучение'});
 fireEvent.click(screen.getByRole('button',{name:'Далее'}));await screen.findByRole('alert');expect(onAccepted).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Вернуться назад'})).toBeDisabled();expect(screen.getAllByRole('button',{name:'Вернуть в обучение'})[0]).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Далее'}));await waitFor(()=>expect(onAccepted).toHaveBeenCalledOnce());
 expect(vi.mocked(saveTrainingKnownChoice).mock.calls[1][0]).toEqual(vi.mocked(saveTrainingKnownChoice).mock.calls[0][0]);
});
test("accepted write with failed next presentation is never sent again",async()=>{
 const onAccepted=vi.fn().mockRejectedValueOnce(new Error('load')).mockResolvedValueOnce(undefined);
 render(<TrainingKnownChoice entryId="entry" sessionId="session" direction="word-to-definition" headword="bank" definition="definition" language="ru" contentLanguage="nl" onBack={vi.fn()} onAccepted={onAccepted}/>);
 await screen.findAllByRole('button',{name:'Вернуть в обучение'});fireEvent.click(screen.getByRole('button',{name:'Далее'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Далее'}));await waitFor(()=>expect(onAccepted).toHaveBeenCalledTimes(2));expect(saveTrainingKnownChoice).toHaveBeenCalledOnce();
});

test("a resolved owner handoff cannot be counted twice while the same card remains mounted",async()=>{
 const {onAccepted}=mount();await screen.findAllByRole('button',{name:'Вернуть в обучение'});fireEvent.click(screen.getByRole('button',{name:'Далее'}));await waitFor(()=>expect(onAccepted).toHaveBeenCalledOnce());expect(screen.getByRole('button',{name:'Далее'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Далее'}));expect(onAccepted).toHaveBeenCalledOnce();expect(saveTrainingKnownChoice).toHaveBeenCalledOnce();
});
