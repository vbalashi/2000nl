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
const edit=(label:string)=>fireEvent.click(screen.getByRole('button',{name:`Edit ${label}`}));
const saves=()=>mocks.fetch.mock.calls.filter(([,options])=>options.method==='POST').map(([,options])=>JSON.parse(options.body));
beforeEach(()=>{vi.clearAllMocks();mocks.headers.mockResolvedValue({'content-type':'application/json'});mocks.fetch.mockResolvedValue(Response.json(record));});

test('saving one name field sends a sparse patch and keeps the card open',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Collection name');
 const form=screen.getByRole('form',{name:'Collection name'});
 const nameInput=within(form).getByRole('textbox',{name:'Collection name'}) as HTMLInputElement;
 expect(nameInput).toHaveValue('Lesson');expect(nameInput).toHaveFocus();expect(nameInput.selectionStart).toBe(0);expect(nameInput.selectionEnd).toBe('Lesson'.length);
 expect(within(form).queryByRole('textbox',{name:'Description'})).not.toBeInTheDocument();
 fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Renamed'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Renamed',revision:'2'}));
 fireEvent.submit(form);await screen.findByRole('heading',{name:'Renamed'});
 expect(saves()).toEqual([{collectionId:id,expectedRevision:'1',patch:{name:'Renamed'}}]);
 expect(screen.getByText('A description')).toBeInTheDocument();expect(screen.getByText('Maker')).toBeInTheDocument();
 expect(screen.getByText('February 29, 2024')).toBeInTheDocument();expect(props.onChanged).toHaveBeenCalled();expect(props.onClose).not.toHaveBeenCalled();
});

test('clearing the optional date saves only the date field',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Publication date');
 const form=screen.getByRole('form',{name:'Publication date'});
 fireEvent.click(within(form).getByRole('button',{name:'Publication date Feb 29, 2024'}));
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,revision:'2',source:{...source,publishedOn:null}}));
 fireEvent.click(screen.getByRole('button',{name:'Clear date'}));
 await waitFor(()=>expect(screen.queryByRole('form',{name:'Publication date'})).toBeNull());
 expect(saves()).toEqual([{collectionId:id,expectedRevision:'1',patch:{source:{publishedOn:null}}}]);
 expect(screen.getByRole('heading',{name:'Lesson'})).toBeInTheDocument();expect(screen.getByText('A description')).toBeInTheDocument();
});

test('conflict keeps the single-field draft and its frozen revision; revocation removes private details',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Collection name');fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Draft'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Changed elsewhere',revision:'2',source:{...source,creatorName:'New author'}}));fireEvent.focus(window);await screen.findByText('New author');expect(screen.getByRole('textbox',{name:'Collection name'})).toHaveValue('Draft');
 mocks.fetch.mockResolvedValueOnce(Response.json({error:'details_conflict'},{status:409}));fireEvent.submit(screen.getByRole('form'));await screen.findByRole('alert');expect(screen.getByRole('textbox',{name:'Collection name'})).toHaveValue('Draft');expect(saves()[0]).toEqual({collectionId:id,expectedRevision:'1',patch:{name:'Draft'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Review latest',revision:'2',source:{...source,creatorName:'Review author'}}));fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByText('Review author');expect(screen.getByRole('textbox',{name:'Collection name'})).toHaveValue('Draft');
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'Draft',revision:'3'}));fireEvent.submit(screen.getByRole('form'));await screen.findByRole('heading',{name:'Draft'});expect(saves()[1]).toEqual({collectionId:id,expectedRevision:'2',patch:{name:'Draft'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({error:'details_unavailable'},{status:404}));fireEvent.focus(window);await waitFor(()=>expect(screen.queryByRole('heading',{name:'Draft'})).toBeNull());expect(screen.queryByText('Maker')).toBeNull();
});

test('recipient reads current and empty source fields but cannot edit any of them',async()=>{
 mocks.fetch.mockResolvedValue(Response.json({...record,isOwner:false,source:{...source,creatorName:'Updated author',publishedOn:null}}));render(<CollectionDetailsController {...props} userId="reader" canEditLabels={false}/>);
 await screen.findByText('Updated author');expect(screen.queryAllByRole('button',{name:/^Edit /})).toHaveLength(0);expect(screen.queryByRole('button',{name:'Choose labels'})).toBeNull();
 expect(screen.getAllByText('Not specified').length).toBeGreaterThan(0);expect(screen.getByText('Publication date')).toBeInTheDocument();
});

test('validation failure keeps the chosen URL for correction without changing other fields',async()=>{
 const onUnavailable=vi.fn();render(<CollectionDetailsController {...props} onUnavailable={onUnavailable}/>);await screen.findByText('Maker');edit('URL');
 fireEvent.change(screen.getByRole('textbox',{name:'URL'}),{target:{value:'https://rejected.example/'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({error:'details_unavailable'},{status:400}));fireEvent.submit(screen.getByRole('form',{name:'URL'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Links must start with http:// or https://');expect(screen.getByRole('textbox',{name:'URL'})).toHaveValue('https://rejected.example/');expect(onUnavailable).not.toHaveBeenCalled();
 expect(saves()[0]).toEqual({collectionId:id,expectedRevision:'1',patch:{source:{url:'https://rejected.example/'}}});
 fireEvent.change(screen.getByRole('textbox',{name:'URL'}),{target:{value:'https://example.org'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,source:{...source,url:'https://example.org'},revision:'2'}));fireEvent.submit(screen.getByRole('form'));await screen.findByRole('link',{name:'https://example.org'});
 expect(screen.getByRole('heading',{name:'Lesson'})).toBeInTheDocument();expect(screen.getByText('A description')).toBeInTheDocument();
});

test.each([401,403,404])('save access failure %i clears private details',async status=>{
 const onUnavailable=vi.fn();render(<CollectionDetailsController {...props} onUnavailable={onUnavailable}/>);await screen.findByText('Maker');edit('Collection name');fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Draft'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({error:'unavailable'},{status}));fireEvent.submit(screen.getByRole('form'));await waitFor(()=>expect(screen.queryByDisplayValue('Draft')).toBeNull());expect(screen.queryByText('Maker')).toBeNull();expect(onUnavailable).toHaveBeenCalledOnce();
});

test('changing accounts immediately clears the prior account and field draft',async()=>{
 const view=render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Collection name');fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Private draft'}});
 mocks.fetch.mockReturnValueOnce(new Promise(()=>{}));view.rerender(<CollectionDetailsController {...props} userId="other"/>);expect(screen.queryByText('Maker')).toBeNull();expect(screen.queryByDisplayValue('Private draft')).toBeNull();
});

test('entering a publication date persists through reading and reopening its field editor',async()=>{
 let stored={...record,source:{...source,publishedOn:null as string|null}};
 mocks.fetch.mockImplementation(async (_url:string,options:RequestInit)=>{
  if(options.method==='POST'){
   const request=JSON.parse(String(options.body));expect(request).toEqual({collectionId:id,expectedRevision:'1',patch:{source:{publishedOn:'2020-02-29'}}});
   stored={...stored,source:{...stored.source,...request.patch.source},revision:'2'};
  }
  return Response.json(stored);
 });
 const view=render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Publication date');
 fireEvent.click(screen.getByRole('button',{name:'Publication date —'}));
 const year=screen.getByRole('spinbutton',{name:'Year'});fireEvent.change(year,{target:{value:'2020'}});fireEvent.blur(year);
 const month=new Date().getMonth();for(let i=month;i>1;i--)fireEvent.click(screen.getByRole('button',{name:'Previous month'}));if(month===0)fireEvent.click(screen.getByRole('button',{name:'Next month'}));
 fireEvent.click(screen.getByRole('button',{name:'Saturday, February 29, 2020'}));
 await screen.findByText('February 29, 2020');
 edit('Publication date');expect(screen.getByRole('button',{name:'Publication date Feb 29, 2020'})).toBeInTheDocument();
 view.unmount();render(<CollectionDetailsController {...props}/>);await screen.findByText('February 29, 2020');edit('Publication date');expect(screen.getByRole('button',{name:'Publication date Feb 29, 2020'})).toBeInTheDocument();
});

test('cancel discards only the chosen field and leaves unrelated values unchanged',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');
 expect(screen.getByRole('img',{name:'Shared by you'})).toBeInTheDocument();edit('Original material title');
 const form=screen.getByRole('form',{name:'Original material title'});
 fireEvent.change(within(form).getByRole('textbox',{name:'Original material title'}),{target:{value:'Unsaved title'}});
 expect(within(form).queryByRole('textbox',{name:'Collection name'})).not.toBeInTheDocument();
 fireEvent.keyDown(within(form).getByRole('textbox'),{key:'Escape'});expect(screen.queryByRole('form')).not.toBeInTheDocument();expect(screen.getByText('Film')).toBeInTheDocument();
 edit('Original material title');expect(screen.getByRole('textbox',{name:'Original material title'})).toHaveValue('Film');expect(saves()).toEqual([]);
});

test('received access is distinct from publication and has a compact help action',async()=>{
 mocks.fetch.mockResolvedValue(Response.json({...record,isOwner:false}));render(<CollectionDetailsController {...props} userId="reader"/>);
 await screen.findByRole('img',{name:'From another author'});expect(screen.getByRole('button',{name:'? Read only'})).toBeInTheDocument();expect(screen.queryByRole('img',{name:'Shared by you'})).not.toBeInTheDocument();
});


test('Enter saves once with no explicit Save or Cancel actions',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Collection name');
 const input=screen.getByRole('textbox',{name:'Collection name'});
 expect(screen.queryByRole('button',{name:'Save'})).toBeNull();expect(screen.queryByRole('button',{name:'Cancel'})).toBeNull();
 fireEvent.change(input,{target:{value:'By Enter'}});mocks.fetch.mockResolvedValueOnce(Response.json({...record,name:'By Enter',revision:'2'}));
 fireEvent.keyDown(input,{key:'Enter'});fireEvent.blur(input);await screen.findByRole('heading',{name:'By Enter'});
 expect(saves()).toHaveLength(1);expect(screen.getByRole('button',{name:'Edit Collection name'})).toBeInTheDocument();
});

test('leaving a changed field saves it and restores the pencil',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Original material title');
 const input=screen.getByRole('textbox',{name:'Original material title'});fireEvent.change(input,{target:{value:'By blur'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,source:{...source,materialTitle:'By blur'},revision:'2'}));
 fireEvent.blur(input,{relatedTarget:document.body});await screen.findByText('By blur');
 expect(saves()).toEqual([{collectionId:id,expectedRevision:'1',patch:{source:{materialTitle:'By blur'}}}]);
 expect(screen.getByRole('button',{name:'Edit Original material title'})).toBeInTheDocument();
});

test('menu focus does not save early, while choosing an option saves it',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Source');
 const trigger=screen.getByRole('button',{name:'Source: YouTube'});fireEvent.click(trigger);
 const option=screen.getByRole('menuitemradio',{name:'Web'});fireEvent.blur(trigger,{relatedTarget:option});expect(saves()).toHaveLength(0);
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,source:{...source,originKind:'web'},revision:'2'}));fireEvent.click(option);
 await screen.findByText('Web');expect(saves()).toEqual([{collectionId:id,expectedRevision:'1',patch:{source:{originKind:'web'}}}]);
});

test('Shift+Enter keeps a description draft; ordinary Enter saves',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('Description');
 const input=screen.getByRole('textbox',{name:'Description'});fireEvent.change(input,{target:{value:'Two\nlines'}});
 fireEvent.keyDown(input,{key:'Enter',shiftKey:true});expect(saves()).toHaveLength(0);
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,description:'Two\nlines',revision:'2'}));fireEvent.keyDown(input,{key:'Enter'});
 await waitFor(()=>expect(screen.queryByRole('form',{name:'Description'})).toBeNull());expect(saves()).toHaveLength(1);
});


test('a bare website address saves as HTTPS without native URL validation',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('URL');
 const input=screen.getByRole('textbox',{name:'URL'});expect(input).toHaveAttribute('type','text');
 fireEvent.change(input,{target:{value:'www.lib.ru'}});
 mocks.fetch.mockResolvedValueOnce(Response.json({...record,source:{...source,url:'https://www.lib.ru/'},revision:'2'}));
 fireEvent.keyDown(input,{key:'Enter'});await screen.findByRole('link',{name:'https://www.lib.ru/'});
 expect(saves()).toEqual([{collectionId:id,expectedRevision:'1',patch:{source:{url:'https://www.lib.ru/'}}}]);
});

test('an unrecognizable address keeps its draft and gives a quiet inline hint',async()=>{
 render(<CollectionDetailsController {...props}/>);await screen.findByText('Maker');edit('URL');
 const input=screen.getByRole('textbox',{name:'URL'});fireEvent.change(input,{target:{value:'not a website'}});
 fireEvent.keyDown(input,{key:'Enter'});
 expect(await screen.findByRole('status')).toHaveTextContent('Use a website address, for example www.example.com.');
 expect(input).toHaveValue('not a website');expect(input).toHaveAttribute('aria-invalid','true');
 expect(screen.queryByRole('alert')).toBeNull();expect(saves()).toHaveLength(0);
 fireEvent.change(input,{target:{value:'www.lib.ru'}});expect(screen.queryByRole('status')).toBeNull();
});
