import React from 'react';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TrainingSessionChrome} from '@/components/training/v2/TrainingSessionChrome';
import {TrainingInteractionSettings} from '@/components/practice/ui/TrainingInteractionSettings';
import {TrainingInteractionPreferencesProvider,defaultTrainingInteractions} from '@/components/practice/ui/TrainingInteractionPreferences';
afterEach(cleanup);
const props={interfaceLanguage:'en' as const,scenario:'understanding',mode:'word-to-definition' as const,cardFilter:'both' as const,presentation:{kind:'planned' as const,position:7,total:15,fraction:7/15},onClose:()=>{},approvedPresentation:true,showProgress:true};
const wrap=(child:React.ReactNode,alwaysShowCardCount=false)=><TrainingInteractionPreferencesProvider userId="test" initial={{...defaultTrainingInteractions,alwaysShowCardCount}}>{child}</TrainingInteractionPreferencesProvider>;
test('finite sessions default to dots and expose exact progress to assistive technology',()=>{
 render(wrap(<TrainingSessionChrome {...props}/>));
 expect(screen.queryByTestId('training-session-position')).toBeNull();
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','7');
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax','15');
});
test('unlimited sessions show the exact count without dots',()=>{
 render(wrap(<TrainingSessionChrome {...props} unlimited presentation={{kind:'planned',position:42,total:2661,fraction:42/2661}}/>));
 expect(screen.getByTestId('training-session-position')).toHaveTextContent('42 / 2661');
 expect(screen.queryByRole('progressbar')).toBeNull();
});
test('count preference shows both indicators in finite sessions',()=>{
 render(wrap(<TrainingSessionChrome {...props}/>,true));
 expect(screen.getByTestId('training-session-position')).toHaveTextContent('7 / 15');
 expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
test('localized count preference saves and reloads from the account repository',async()=>{
 let stored={...defaultTrainingInteractions};
 const repository={load:vi.fn(async()=>stored),save:vi.fn(async(_id:string,value:typeof stored)=>{stored=value;})};
 const view=()=> <TrainingInteractionPreferencesProvider userId="test" repository={repository}><TrainingInteractionSettings language="ru"/></TrainingInteractionPreferencesProvider>;
 const {unmount}=render(view());
 const toggle=await screen.findByRole('switch',{name:'Всегда показывать количество карточек'});
 await waitFor(()=>expect(toggle).toBeEnabled());fireEvent.click(toggle);
 await waitFor(()=>expect(stored.alwaysShowCardCount).toBe(true));
 unmount();render(view());
 await waitFor(()=>expect(screen.getByRole('switch',{name:'Всегда показывать количество карточек'})).toHaveAttribute('aria-checked','true'));
});

test('oversized finite legacy plans use an exact counter without sampled dots',()=>{
 render(wrap(<TrainingSessionChrome {...props} presentation={{kind:'planned',position:42,total:2000,fraction:42/2000}}/>));
 expect(screen.queryByTestId('training-session-position')).toBeNull();
 expect(screen.getByRole('progressbar')).toHaveAttribute('data-variant','line');
});
