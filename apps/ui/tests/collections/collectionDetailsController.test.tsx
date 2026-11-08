import React from 'react';
import {beforeEach,expect,test,vi} from 'vitest';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {CollectionDetailsController} from '@/components/library/organization/CollectionDetailsController';
const mocks=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mocks.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mocks.fetch}));
const id='75600000-0000-4000-8000-000000000001';
const source={materialKind:'video',originKind:'youtube',materialTitle:'Film',creatorName:'Maker',url:'https://example.com',fileName:null,publishedOn:'2024-02-29'};
const record={id,name:'Lesson',description:'A description',source,revision:'1',isOwner:true};
const props={userId:'owner',id,itemCount:2,labelNames:['YouTube'],canEditLabels:true,locale:'en' as const,isShared:true,onClose:vi.fn(),onLabels:vi.fn(),onOpen:vi.fn(),onChanged:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mocks.headers.mockResolvedValue({'content-type':'application/json'});mocks.fetch.mockResolvedValue(Response.json(record));});
test('edits and saves details, clears the date and keeps the card open',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');fireEvent.click(screen.getByRole('button',{name:'Edit collection'}));
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Renamed'}});fireEvent.change(screen.getByLabelText('Publication date'),{target:{value:''}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Renamed',revision:'2',source:{...source,publishedOn:null}}));
 fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('heading',{name:'Renamed'});
 const request=mocks.fetch.mock.calls.find(([,options])=>options.method==='POST');expect(JSON.parse(request![1].body)).toMatchObject({expectedRevision:'1',patch:{name:'Renamed',source:{publishedOn:null}}});
 expect(screen.getAllByText('YouTube')).toHaveLength(2);expect(props.onChanged).toHaveBeenCalled();expect(props.onClose).not.toHaveBeenCalled();
});
test('conflict keeps the draft, and revoked access removes private details',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');fireEvent.click(screen.getByRole('button',{name:'Edit collection'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Draft'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Changed elsewhere',revision:'2'}));fireEvent.focus(window);await screen.findByRole('heading',{name:'Changed elsewhere'});expect(screen.getByLabelText('Name')).toHaveValue('Draft');
 mocks.fetch.mockResolvedValueOnce(Response.json({error:'details_conflict'},{status:409}));fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('alert');expect(screen.getByLabelText('Name')).toHaveValue('Draft');const firstSave=mocks.fetch.mock.calls.find(([,options])=>options.method==='POST');expect(JSON.parse(firstSave![1].body).expectedRevision).toBe('1');
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Review latest',revision:'2'}));fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByRole('heading',{name:'Review latest'});expect(screen.getByLabelText('Name')).toHaveValue('Draft');
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Draft',revision:'3'}));fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('heading',{name:'Draft'});const saves=mocks.fetch.mock.calls.filter(([,options])=>options.method==='POST');expect(JSON.parse(saves[1][1].body).expectedRevision).toBe('2');
 mocks.fetch.mockResolvedValueOnce(Response.json({error:'details_unavailable'},{status:404}));fireEvent.focus(window);await waitFor(()=>expect(screen.queryByRole('heading',{name:'Draft'})).toBeNull());expect(screen.queryByText('Maker')).toBeNull();
});
test('recipient can read current details but cannot edit them',async()=>{
 mocks.fetch.mockResolvedValue(Response.json({...record,isOwner:false,source:{...source,creatorName:'Updated author',publishedOn:null}}));render(<CollectionDetailsController {...props} userId="reader" canEditLabels={false}/>);
 await screen.findByText('Updated author');expect(screen.queryByRole('button',{name:'Edit collection'})).toBeNull();expect(screen.queryByRole('button',{name:'Choose labels'})).toBeNull();
});

test('validation failure keeps the draft for correction and resubmission',async()=>{
 const onUnavailable=vi.fn();render(<CollectionDetailsController {...props} onUnavailable={onUnavailable}/>);await screen.findByText('Maker');fireEvent.click(screen.getByRole('button',{name:'Edit collection'}));
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'   '}});fireEvent.change(screen.getByLabelText('URL'),{target:{value:'ftp://example.com'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({error:'details_unavailable'},{status:400}));fireEvent.submit(screen.getByRole('button',{name:'Save'}).closest('form')!);
 expect(await screen.findByRole('alert')).toHaveTextContent('Links must start with http:// or https://');expect(screen.getByLabelText('Name')).toHaveValue('   ');expect(screen.getByLabelText('URL')).toHaveValue('ftp://example.com');expect(onUnavailable).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Corrected'}});fireEvent.change(screen.getByLabelText('URL'),{target:{value:'https://example.org'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Corrected',source:{...source,url:'https://example.org'},revision:'2'}));fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('heading',{name:'Corrected'});
});
test.each([401,403,404])('save access failure %i clears private details',async status=>{
 const onUnavailable=vi.fn();render(<CollectionDetailsController {...props} onUnavailable={onUnavailable}/>);await screen.findByText('Maker');fireEvent.click(screen.getByRole('button',{name:'Edit collection'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Draft'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({error:'unavailable'},{status}));fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(screen.queryByDisplayValue('Draft')).toBeNull());expect(screen.queryByText('Maker')).toBeNull();expect(onUnavailable).toHaveBeenCalledOnce();
});
test('changing accounts immediately clears the prior account and draft',async()=>{
 const view=render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');fireEvent.click(screen.getByRole('button',{name:'Edit collection'}));fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Private draft'}});
 mocks.fetch.mockReturnValueOnce(new Promise(()=>{}));view.rerender(<CollectionDetailsController {...props} userId="other"/>);expect(screen.queryByText('Maker')).toBeNull();expect(screen.queryByDisplayValue('Private draft')).toBeNull();
});
test('entering a publication date persists it through reading and reopening the editor',async()=>{
 let stored={...record,source:{...source,publishedOn:null as string|null}};
 mocks.fetch.mockImplementation(async (_url:string,options:RequestInit)=>{
  if(options.method==='POST'){
   const request=JSON.parse(String(options.body));
   expect(request.patch.source).toEqual({publishedOn:'2020-02-29'});
   stored={...stored,source:{...stored.source,...request.patch.source},revision:'2'};
  }
  return Response.json(stored);
 });
 const view=render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');fireEvent.click(screen.getByRole('button',{name:'Edit collection'}));
 const date=screen.getByLabelText('Publication date');expect(date).toHaveValue('');fireEvent.change(date,{target:{value:'2020-02-29'}});fireEvent.blur(date);
 fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByText('February 29, 2020');
 fireEvent.click(screen.getByRole('button',{name:'Edit collection'}));expect(screen.getByLabelText('Publication date')).toHaveValue('2020-02-29');
 view.unmount();render(<CollectionDetailsController {...props}/>);await screen.findByText('February 29, 2020');fireEvent.click(screen.getByRole('button',{name:'Edit collection'}));expect(screen.getByLabelText('Publication date')).toHaveValue('2020-02-29');
});
