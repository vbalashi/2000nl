import React from 'react';
import {beforeEach,test,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {ExerciseKnownChoices} from '../components/practice/ExerciseKnownChoices';
const {fetchChoices,resume}=vi.hoisted(()=>({fetchChoices:vi.fn(),resume:vi.fn()}));
vi.mock('@/lib/platform/exerciseKnownChoicesClient',()=>({fetchExerciseKnownChoices:fetchChoices,resumeExerciseKnownChoice:resume}));
const choice={exclusionId:'pair-1',targetId:'target-1',family:'idiom',text:'de draad oppakken',directions:['direct','reverse']};
beforeEach(()=>{fetchChoices.mockReset();resume.mockReset();fetchChoices.mockResolvedValue([choice]);resume.mockResolvedValue(undefined);});
test('Library exposes both directions and resumes an old Known group after notification is gone',async()=>{
 fetchChoices.mockResolvedValueOnce([choice]).mockResolvedValue([]);const changed=vi.fn();
 render(<ExerciseKnownChoices entryId="entry-1" language="ru" blocked={false} onChanged={changed}/>);
 await screen.findByText('de draad oppakken');const button=screen.getByRole('button',{name:'Вернуть в обучение'});fireEvent.click(button);
 await waitFor(()=>expect(resume).toHaveBeenCalledWith('entry-1',choice,expect.any(String)));
 await waitFor(()=>expect(screen.queryByText('de draad oppakken')).toBeNull());expect(changed).toHaveBeenCalledOnce();
});
test('uncertain save can retry with the same receipt; active training blocks mutation',async()=>{
 resume.mockRejectedValueOnce(new Error('network'));const view=render(<ExerciseKnownChoices entryId="entry-1" language="ru" blocked={false}/>);
 const button=await screen.findByRole('button',{name:'Вернуть в обучение'});fireEvent.click(button);await screen.findByRole('alert');
 fireEvent.click(button);await waitFor(()=>expect(resume).toHaveBeenCalledTimes(2));expect(resume.mock.calls[1]).toEqual(resume.mock.calls[0]);
 view.rerender(<ExerciseKnownChoices entryId="entry-1" language="ru" blocked={true}/>);await screen.findByText('de draad oppakken');expect(screen.getByRole('button',{name:'Вернуть в обучение'})).toBeDisabled();
});
