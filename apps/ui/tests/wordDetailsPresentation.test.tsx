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

test('JSONB-ordered rows render in grammatical order with cells still attached',()=>{
 const detail=wordFormDetail(details({verb_forms:'ontmoette, heeft ontmoet',conjugation_table:{past:{u:'ontmoette',ik:'ontmoette',jij:'ontmoette',wij:'ontmoetten',zij:'ontmoetten',jullie:'ontmoetten',hij_zij_het:'ontmoette'},present:{u:'ontmoet',ik:'ontmoet',jij:'ontmoet',wij:'ontmoeten',zij:'ontmoeten',jullie:'ontmoeten',hij_zij_het:'ontmoet'}}}),'ww');
 render(<ArticleWordForms detail={detail} headword="ontmoeten" interfaceLanguage="en" contentLanguage="nl" part="body" open onToggle={()=>{}} id="ordered"/>);
 const rows=within(screen.getByRole('table')).getAllByRole('row').slice(1);
 expect(rows.map(row=>within(row).getByRole('rowheader').textContent)).toEqual(['ik','jij','u','hij / zij / het','wij','jullie','zij']);
 expect(rows.map(row=>within(row).getAllByRole('cell').map(cell=>cell.textContent))).toEqual([['ontmoet','ontmoette'],['ontmoet','ontmoette'],['ontmoet','ontmoette'],['ontmoet','ontmoette'],['ontmoeten','ontmoetten'],['ontmoeten','ontmoetten'],['ontmoeten','ontmoetten']]);
});

test('separable verbs keep dat rows next to their person and readable',()=>{
 const detail=wordFormDetail(details({conjugation_table:{present:{dat_wij:'bellen',wij:'bellen op',dat_ik:'opbel',ik:'bel op',dat_hij_zij_het:'opbelt',hij_zij_het:'belt op'}}}),'ww');
 render(<ArticleWordForms detail={detail} headword="opbellen" interfaceLanguage="en" contentLanguage="nl" part="body" open onToggle={()=>{}} id="separable"/>);
 const rows=within(screen.getByRole('table')).getAllByRole('row').slice(1);
 expect(rows.map(row=>within(row).getByRole('rowheader').textContent)).toEqual(['ik','dat ik','hij / zij / het','dat hij / zij / het','wij','dat wij']);
 expect(within(rows[1]).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['opbel','—']);
});

test('conjugation-only summary prefers singular past regardless of key order',()=>{
 const detail=wordFormDetail(details({conjugation_table:{past:{wij:'gingen',zij:'gingen',ik:'ging'},present:{wij:'gaan',ik:'ga'}}}),'ww');
 render(<ArticleWordForms detail={detail} headword="gaan" interfaceLanguage="en" contentLanguage="nl" part="summary" open={false} onToggle={()=>{}} id="singular"/>);
 expect(screen.getByRole('button')).toHaveTextContent('ging');
 expect(screen.queryByText('gingen')).not.toBeInTheDocument();
});

test('multiple alternate headwords are retained in the collapsed fallback',()=>{
 const detail=wordFormDetail(details({alternate_headwords:[{headword:'rectrix'},{headword:'rectrice'}]}),'zn');
 render(<ArticleWordForms detail={detail} headword="rector" interfaceLanguage="en" contentLanguage="nl" part="summary" open={false} onToggle={()=>{}} id="alternatives"/>);
 expect(screen.getByText('rectrix, rectrice')).toBeInTheDocument();
});

test('noun and adjective form roles keep semantic order and retain multiple values',()=>{
 const noun=wordFormDetail(details({diminutive:'huisje',plural:['huizen','huizes']}),'zn');
 const view=render(<ArticleWordForms detail={noun} headword="huis" interfaceLanguage="en" contentLanguage="nl" part="summary" open={false} onToggle={()=>{}} id="noun"/>);
 expect(view.container.textContent).toBe('pluralhuizen, huizesdiminutivehuisje');
 view.unmount();
 const adjective=wordFormDetail(details({superlative:'grootst',comparative:'groter',inflected_form:'grote'}),'bn');
 const adjectiveView=render(<ArticleWordForms detail={adjective} headword="groot" interfaceLanguage="en" contentLanguage="nl" part="summary" open={false} onToggle={()=>{}} id="adjective"/>);
 expect(adjectiveView.container.textContent).toBe('comparativegrotersuperlativegrootst');
});

test('past-only and unknown persons retain their forms and missing-cell placeholders',()=>{
 const detail=wordFormDetail(details({verb_forms:'ging',conjugation_table:{present:{ik:'ga',custom:'custom present'},past:{jullie:'gingen',ik:'ging',other:'other past'}}}),'ww');
 render(<ArticleWordForms detail={detail} headword="gaan" interfaceLanguage="en" contentLanguage="nl" part="body" open onToggle={()=>{}} id="partial"/>);
 const rows=within(screen.getByRole('table')).getAllByRole('row').slice(1);
 expect(rows.map(row=>within(row).getByRole('rowheader').textContent)).toEqual(['ik','jullie','custom','other']);
 expect(within(rows[1]).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['—','gingen']);
 expect(within(rows[3]).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['—','other past']);
});

test('perfect field order and missing perfect do not affect table columns',()=>{
 const detail=wordFormDetail(details({verb_forms:'zou',conjugation_table:{perfect:{},past:{ik:'zou'},present:{ik:'zal'}}}),'ww');
 const view=render(<ArticleWordForms detail={detail} headword="zullen" interfaceLanguage="en" contentLanguage="nl" part="body" open onToggle={()=>{}} id="no-perfect"/>);
 expect(within(screen.getByRole('table')).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['zal','zou']);
 expect(screen.queryByText('perfect')).not.toBeInTheDocument();
 view.unmount();
 const complete=wordFormDetail(details({conjugation_table:{perfect:{participle:'gegaan',auxiliary:'is'},past:{ik:'ging'},present:{ik:'ga'}}}),'ww');
 render(<ArticleWordForms detail={complete} headword="gaan" interfaceLanguage="en" contentLanguage="nl" part="summary" open={false} onToggle={()=>{}} id="perfect"/>);
 expect(screen.getByText('is gegaan')).toBeInTheDocument();
});
