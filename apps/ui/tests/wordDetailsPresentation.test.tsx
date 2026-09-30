import React from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {ArticleWordForms} from '@/components/practice/article/ArticleWordDetails';
import {wordFormDetail,commonWordForms} from '@/components/practice/article/wordDetailsPresentation';
import {projectPlatformV2WordDetails} from '@/lib/platform/platformV2RichContent';
import {buildLibrarySenseCardGroupModel} from '@/components/training/library-v2/librarySenseCardModel';
import {LibrarySenseCardGroup} from '@/components/training/library-v2/LibrarySenseCardGroup';
import {multiSenseBankGroup} from './platformV2LibraryFixture';

function details(raw:Record<string,unknown>){return projectPlatformV2WordDetails({id:'entry',headword:'word',raw},[])!;}
afterEach(()=>{vi.unstubAllEnvs();});

test('verb forms use canonical feature values and show conjugation without repeating perfect',()=>{
 const data=details({verb_forms:['ging','is gegaan'],conjugation_table:{present:{ik:'ga',wij:'gaan'},past:{ik:'ging',wij:'gingen'},perfect:{auxiliary:'is',participle:'gegaan'}}});
 const detail=wordFormDetail(data,'ww')!;expect(detail.conjugation.past.ik).toBe('ging');
 const props={detail,headword:'gaan',interfaceLanguage:'en' as const,contentLanguage:'nl',open:true,onToggle:vi.fn(),id:'forms'};
 render(<><ArticleWordForms {...props} part="summary"/><ArticleWordForms {...props} part="body"/></>);
 expect(screen.getAllByText('is gegaan')).toHaveLength(1);
 expect(within(screen.getByRole('table')).getByText('gingen')).toHaveAttribute('lang','nl');
 expect(screen.queryByText('Principal forms')).not.toBeInTheDocument();
});

test('conjugation-only verb has a nonempty lead and one disclosure',()=>{
 const detail=wordFormDetail(details({conjugation_table:{present:{ik:'ga'},past:{ik:'ging'}}}),'ww');
 render(<ArticleWordForms detail={detail} headword="gaan" interfaceLanguage="ru" contentLanguage="nl" part="summary" open={false} onToggle={()=>{}} id="fallback"/>);
 expect(screen.getByRole('button')).toHaveTextContent('ging');
});

for(const pos of ['zn','bn','bw','tw','vnw','vz','vw','lidw','tsw','afk'])test(`${pos}: forms stay populated without assuming every entry has primary forms`,()=>{
 const detail=wordFormDetail(details({derivations:['afgeleid']}),pos);
 render(<ArticleWordForms detail={detail} headword="word" interfaceLanguage="en" part="summary" open={false} onToggle={()=>{}} id="forms"/>);
 expect(screen.getByText('afgeleid')).toBeInTheDocument();
});

test('unknown form and tense text is preserved; absent forms produce no empty affordance',()=>{
 const data=details({conjugation_table:{future:{ik:'zal gaan'}}});
 expect(wordFormDetail(data,'ww')?.forms).toEqual([{label:'Form',value:'zal gaan'}]);
 const view=render(<ArticleWordForms detail={null} headword="word" interfaceLanguage="en" part="summary" open={false} onToggle={()=>{}} id="empty"/>);
 expect(view.container).toBeEmptyDOMElement();
});

test('headword forms require all senses to agree; missing or differing forms stay sense-scoped',()=>{
 const a=details({plural:'banken'}),b=details({plural:'banks'});
 expect(commonWordForms([a,a],'zn')?.forms[0].value).toBe('banken');
 expect(commonWordForms([a,b],'zn')).toBeNull();expect(commonWordForms([a,undefined],'zn')).toBeNull();
});

test('relations remain attached to their meaning even with no forms and are never translated',()=>{
 vi.stubEnv('NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1','true');
 const group=structuredClone(multiSenseBankGroup);const entries=group.entries.filter(e=>e.kind==='sense-card');
 entries[0].wordDetails=details({meanings:[{synonyms:['de zetel']}]});entries[1].wordDetails=details({meanings:[{antonyms:['unique opposite']}]});
 const model=buildLibrarySenseCardGroupModel(group,'en');
 render(<LibrarySenseCardGroup model={model} interfaceLanguage="en" contentLanguage="nl" onAction={()=>{}} translationEnabled/>);
 expect(within(screen.getByTestId('library-sense-card-'+entries[0].entryId)).getByText('de zetel')).toHaveAttribute('lang','nl');
 expect(within(screen.getByTestId('library-sense-card-'+entries[1].entryId)).getByText('unique opposite')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Translate'}));
 expect(screen.getByText('de zetel').closest('[data-content-translation]')).toBeNull();
 expect(screen.queryByRole('button',{name:/forms of/})).not.toBeInTheDocument();
});
