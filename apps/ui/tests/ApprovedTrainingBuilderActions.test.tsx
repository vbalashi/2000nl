import React from 'react';
import {afterEach,beforeAll,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {ApprovedTrainingBuilder} from '@/components/training/pilot/ApprovedTrainingBuilder';
afterEach(cleanup);
beforeAll(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
});
function props(){return {
 interfaceLanguage:'en' as const,draft:{family:'meaning' as const,scenarioId:'understanding',modes:['word-to-definition' as const],cardFilter:'review' as const,listValue:'all',newReviewRatio:2,dateWindow:'all' as const,sourceValue:'all',sessionSize:5},
 languageCode:'nl',languageOptions:[],lists:[],dictionaries:[],sources:[],scenarios:[],languagePending:false,dictionariesLoading:false,translationLanguage:'ru',name:'Original',onNameChange:vi.fn(),onLanguageChange:vi.fn(),onDraftChange:vi.fn(),onSelectFamily:vi.fn(),onToggleMode:vi.fn(),onMixChange:vi.fn(),onBack:vi.fn(),onSave:vi.fn(async()=>true),onBeginSave:vi.fn(),onStart:vi.fn(),saveDisabled:false,startDisabled:false,saveLabel:'Update training',startLabel:'Start training',canSave:true,editing:true,onSaveAs:vi.fn(async(_name:string)=>true),onDelete:vi.fn(async()=>true),saveAsLabel:'Save as…',deleteLabel:'Delete training'
};}
test('existing name is inline; Update saves directly and Delete is one footer action',async()=>{
 const p=props();render(<ApprovedTrainingBuilder {...p}/>);
 fireEvent.click(screen.getByRole('button',{name:'Training name'}));
 fireEvent.change(screen.getByRole('textbox',{name:'Training name'}),{target:{value:'Renamed'}});
 expect(p.onNameChange).toHaveBeenCalledWith('Renamed');
 fireEvent.click(screen.getByRole('button',{name:'Update training'}));
 await waitFor(()=>expect(p.onSave).toHaveBeenCalledOnce());
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 const remove=screen.getByRole('button',{name:'Delete training'});
 expect(remove.closest('footer')).not.toBeNull();fireEvent.click(remove);expect(p.onDelete).not.toHaveBeenCalled();
 const dialog=screen.getByRole("dialog",{name:"Delete training?"});
 expect(within(dialog).getByRole("button",{name:"Cancel"})).toHaveFocus();
 fireEvent.click(within(dialog).getByRole("button",{name:"Delete training"}));
 await waitFor(()=>expect(p.onDelete).toHaveBeenCalledOnce());
});
test('Save as uses a separate name and keeps failed prompt open before successful creation',async()=>{
 const p=props();p.onSaveAs.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 render(<ApprovedTrainingBuilder {...p}/>);
 const summary=screen.getByLabelText('Save as…');fireEvent.click(summary);
 fireEvent.click(screen.getByRole('button',{name:'Save as…'}));
 const dialog=screen.getByRole('dialog',{name:'Save as…'});
 fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'  Copy  '}});
 fireEvent.click(within(dialog).getByRole('button',{name:'Save as…'}));
 await waitFor(()=>expect(p.onSaveAs).toHaveBeenCalledWith('Copy'));
 expect(p.onNameChange).not.toHaveBeenCalled();expect(p.onSave).not.toHaveBeenCalled();
 expect(dialog).toBeInTheDocument();
 await waitFor(()=>expect(within(dialog).getByRole('button',{name:'Save as…'})).toBeEnabled());
 fireEvent.click(within(dialog).getByRole('button',{name:'Save as…'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
test('new training retains name prompt; copy/deletion controls do not appear',()=>{
 const p=props();render(<ApprovedTrainingBuilder {...p} editing={false} saveLabel="Save training"/>);
 expect(screen.queryByRole('textbox',{name:'Training name'})).not.toBeInTheDocument();
 expect(screen.queryByLabelText('Save as…')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Delete training'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Save training'}));
 expect(screen.getByRole('dialog',{name:'Save training'})).toBeInTheDocument();
 expect(p.onSave).not.toHaveBeenCalled();
});

test('failed deletion keeps confirmation visible and original recipe intact',async()=>{
 const p=props();p.onDelete.mockResolvedValueOnce(false);render(<ApprovedTrainingBuilder {...p}/>);
 fireEvent.click(screen.getByRole('button',{name:'Delete training'}));
 const dialog=screen.getByRole('dialog',{name:'Delete training?'});
 fireEvent.click(within(dialog).getByRole('button',{name:'Delete training'}));
 await waitFor(()=>expect(p.onDelete).toHaveBeenCalledOnce());
 await waitFor(()=>expect(within(dialog).getByRole('button',{name:'Delete training'})).toBeEnabled());
 expect(dialog).toBeInTheDocument();expect(p.onNameChange).not.toHaveBeenCalled();
});

test('unsaved indicator is accessible and clears when parent reports the saved baseline',()=>{
 const p=props();const view=render(<ApprovedTrainingBuilder {...p} hasUnsavedChanges/>);
 expect(screen.getByRole('status',{name:'Unsaved changes'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:p.saveLabel})).toBeInTheDocument();
 view.rerender(<ApprovedTrainingBuilder {...p} hasUnsavedChanges={false}/>);
 expect(screen.queryByRole('status',{name:'Unsaved changes'})).not.toBeInTheDocument();
});

test.each([
 ['en','Word activity','Saved word activity filters still apply: YouTube'],
 ['nl','Woordactiviteit','Opgeslagen filters voor woordactiviteit blijven gelden: YouTube'],
 ['ru','Активность слов','Сохранённые фильтры активности слов по-прежнему действуют: YouTube'],
] as const)('unfinished activity controls are absent and scoped recipes are explained in %s',(locale,activity,notice)=>{
 const p=props();
 render(<ApprovedTrainingBuilder {...p} interfaceLanguage={locale} draft={{...p.draft,sourceValue:'kind:youtube',dateWindow:'today'}}/>);
 const filters=document.querySelector<HTMLButtonElement>('[data-builder-section="filters"]')!;
 fireEvent.click(filters);
 expect(screen.queryByText(activity)).not.toBeInTheDocument();
 expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
 expect(screen.getByText(text=>text.startsWith(notice))).toBeInTheDocument();
 expect(p.onDraftChange).not.toHaveBeenCalled();
});
test('default activity scope needs no notice and opening controls does not change its values',()=>{
 const p=props();render(<ApprovedTrainingBuilder {...p}/>);
 fireEvent.click(screen.getByRole('button',{name:/^Filters /}));
 expect(screen.queryByText(/Saved word activity filters/)).not.toBeInTheDocument();
 expect(screen.queryByText('Word activity')).not.toBeInTheDocument();
 expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
 expect(p.onDraftChange).not.toHaveBeenCalled();
});

test('clearing a Library query keeps the selected collection language',()=>{
 const p=props();const draft={...p.draft,materialMode:'collection' as const,librarySelection:{languageCode:'en',query:'bank',category:'headwords' as const}};render(<ApprovedTrainingBuilder {...p} draft={draft}/>);
 fireEvent.click(screen.getByRole('button',{name:/^Filters /}));fireEvent.click(screen.getByRole('button',{name:'Clear Library selection'}));
 const update=p.onDraftChange.mock.calls.at(-1)![0] as (current:typeof draft)=>typeof draft;expect(update(draft).librarySelection).toEqual({languageCode:'en',query:'',category:'headwords'});
});

 test.each(['idiom','word-in-context'] as const)('source words have a separate explicit choice for %s',family=>{
  const p=props();const draft={...p.draft,family};render(<ApprovedTrainingBuilder {...p} draft={draft}/>);
  fireEvent.click(screen.getByRole('button',{name:/^Filters /}));
  expect(screen.getByRole('button',{name:'Learning only'})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(within(screen.getByRole('group',{name:'Source words'})).getByRole('button',{name:'All words'}));
  const update=p.onDraftChange.mock.calls.at(-1)![0] as (current:typeof draft)=>typeof draft & {sourceWordStatus:string};
  expect(update(draft)).toMatchObject({sourceWordStatus:'all',cardFilter:'review'});
 });
