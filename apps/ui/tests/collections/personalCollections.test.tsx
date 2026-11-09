import React from "react";
import {afterEach,beforeAll, beforeEach, expect, test, vi} from "vitest";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {PersonalCollections} from "@/components/library/organization/PersonalCollections";
import {LabelsRequestError} from "@/lib/collections/labels/client";
const {request,create,detailsFetch} = vi.hoisted(()=>({request:vi.fn(),create:vi.fn(),detailsFetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:vi.fn().mockResolvedValue({})}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:detailsFetch}));
vi.mock("@/lib/collections/labels/client",()=>({requestLabels:request,LabelsRequestError:class extends Error {constructor(readonly code:string){super(code);}}}));
vi.mock("@/lib/training/listService",()=>({createUserList:create,updateUserList:vi.fn(),deleteUserList:vi.fn()}));
vi.mock('@/components/library/sharing/useLabelSharingCatalog',()=>({useLabelSharingCatalog:()=>({status:'ready',data:{owned:[],received:[{labelId:'received-group',name:'Received group',collectionCount:0}]},refresh:vi.fn()})}));
vi.mock('@/components/library/sharing/useLabelShareCollections',()=>({useLabelShareCollections:()=>({status:'ready',page:{collections:[],nextCursor:null},references:[{collectionId:'original',name:'Original publication',invitationCode:'A'.repeat(26)}]})}));
afterEach(()=>{vi.unstubAllEnvs();});
const labelId="00000000-0000-4000-8000-000000000001";
const collectionId="00000000-0000-4000-8000-000000000002";
const snapshot={revision:4,labels:[{id:labelId,parent_id:null,name:"YouTube",description:null,created_at:"2026-10-25",updated_at:"2026-10-25"}],assignments:[{label_id:labelId,collection_id:collectionId}]};
const props={active:true,userId:"owner",language:"nl",locale:"en" as const,collections:[{id:collectionId,name:"My lesson",type:"user" as const,item_count:2}],onReload:vi.fn().mockResolvedValue(undefined),onOpen:vi.fn()};
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};});
beforeEach(()=>{vi.clearAllMocks();request.mockResolvedValue(snapshot);detailsFetch.mockResolvedValue(Response.json({id:collectionId,name:"My lesson",description:null,source:null,revision:"0",isOwner:true}));});
test("unlabelled projection changes only display; open keeps exact collection identity",async()=>{
 render(<PersonalCollections {...props}/>);await screen.findByText("My lesson");
 fireEvent.click(screen.getByRole("button",{name:"Unlabelled"}));expect(screen.queryByText("My lesson")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"All collections"}));fireEvent.click(screen.getByRole("button",{name:"My lesson"}));
 expect(props.onOpen).not.toHaveBeenCalled();
 const details=screen.getByRole("complementary",{name:"Collections"});
 fireEvent.click(await within(details).findByRole("button",{name:"View words"}));
 expect(props.onOpen).toHaveBeenCalledWith(props.collections[0]);expect(request).toHaveBeenCalledTimes(1);
});
test("409 preserves draft and rereads without automatic write replay",async()=>{
 request.mockImplementation((_signal,mutation)=>mutation?Promise.reject(new LabelsRequestError("conflict")):Promise.resolve(snapshot));
 render(<PersonalCollections {...props}/>);await screen.findByText("My lesson");fireEvent.click(screen.getByRole("button",{name:"New label"}));
 const dialog=screen.getByRole("dialog");fireEvent.change(within(dialog).getByLabelText("Name"),{target:{value:"Draft label"}});fireEvent.click(within(dialog).getByRole("button",{name:"Save"}));
 await within(dialog).findByRole("alert");expect(within(dialog).getByLabelText("Name")).toHaveValue("Draft label");
 expect(request.mock.calls.filter(call=>call[1])).toHaveLength(1);expect(request.mock.calls.find(call=>call[1])?.[1]).toMatchObject({expectedRevision:4,operation:{type:"create",name:"Draft label"}});
});
test("failed load is not presented as an empty collection catalog",async()=>{
 request.mockRejectedValue(new LabelsRequestError("unavailable"));render(<PersonalCollections {...props}/>);
 expect(await screen.findByRole("alert")).toHaveTextContent("not available");expect(screen.queryByText("No collections yet")).toBeNull();
});
test("duplicate submit cannot create a second collection while pending",async()=>{
 let finish:(value:unknown)=>void=()=>{};create.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 render(<PersonalCollections {...props}/>);await screen.findByText("My lesson");fireEvent.click(screen.getByRole("button",{name:"New collection"}));
 const dialog=screen.getByRole("dialog");fireEvent.change(within(dialog).getByLabelText("Name"),{target:{value:"New lesson"}});
 const form=dialog.querySelector("form")!;fireEvent.submit(form);fireEvent.submit(form);expect(create).toHaveBeenCalledTimes(1);
 finish({...props.collections[0],name:"New lesson"});await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
});

test("renaming the selected root label preserves its explicit null parent",async()=>{
 request.mockImplementation((_signal,mutation)=>Promise.resolve(mutation?{...snapshot,revision:5}:snapshot));
 render(<PersonalCollections {...props}/>);await screen.findByText("My lesson");
 fireEvent.click(screen.getByRole("button",{name:/^YouTube$/}));
 fireEvent.click(screen.getByRole("button",{name:"More actions: YouTube"}));
 fireEvent.click(screen.getByRole("menuitem",{name:"Edit label"}));
 const dialog=screen.getByRole("dialog");
 expect(within(dialog).getByRole("button",{name:"Parent label: No parent"})).toHaveTextContent("No parent");
 fireEvent.change(within(dialog).getByLabelText("Name"),{target:{value:"Renamed"}});
 fireEvent.click(within(dialog).getByRole("button",{name:"Save"}));
 await waitFor(()=>expect(request.mock.calls.find(call=>call[1])?.[1]).toMatchObject({operation:{type:"update",id:labelId,parent_id:null,name:"Renamed"}}));
});


test("label View words preserves aggregate identity without changing assignments",async()=>{
 const onOpenLabel=vi.fn();render(<PersonalCollections {...props} onOpenLabel={onOpenLabel}/>);
 await screen.findByText("My lesson");
 fireEvent.click(screen.getByRole("button",{name:"More actions: YouTube"}));
 fireEvent.click(screen.getByRole("menuitem",{name:"View words"}));
 expect(onOpenLabel).toHaveBeenCalledWith(snapshot.labels[0]);
 expect(request.mock.calls.filter(call=>call[1])).toHaveLength(0);
});

test("details clear on account change and stay open when a row disappears from the catalog",async()=>{
 const view=render(<PersonalCollections {...props}/>);await screen.findByText("My lesson");
 fireEvent.click(screen.getByRole("button",{name:"My lesson"}));
 expect(screen.getByRole("complementary",{name:"Collections"})).toBeInTheDocument();
 view.rerender(<PersonalCollections {...props} userId="another-owner"/>);
 expect(screen.queryByRole("complementary",{name:"Collections"})).toBeNull();
 view.rerender(<PersonalCollections {...props}/>);await screen.findByRole("button",{name:"My lesson"});
 fireEvent.click(screen.getByRole("button",{name:"My lesson"}));
 view.rerender(<PersonalCollections {...props} collections={[]}/>);
 expect(screen.getByRole("complementary",{name:"Collections"})).toBeInTheDocument();
});

test("changing label scope closes details and does not reopen them on return",async()=>{
 render(<PersonalCollections {...props}/>);await screen.findByRole("button",{name:"My lesson"});
 fireEvent.click(screen.getByRole("button",{name:"My lesson"}));
 expect(screen.getByRole("complementary",{name:"Collections"})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Unlabelled"}));
 expect(screen.queryByRole("complementary",{name:"Collections"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/^YouTube$/}));
 expect(screen.getByRole("button",{name:"My lesson"})).toBeInTheDocument();
 expect(screen.queryByRole("complementary",{name:"Collections"})).toBeNull();
});

test("saving labels leaves details open even after removing the current scope label",async()=>{
 request.mockImplementation((_signal,mutation)=>Promise.resolve(mutation?{...snapshot,revision:5,assignments:[]}:snapshot));
 render(<PersonalCollections {...props}/>);await screen.findByRole("button",{name:"My lesson"});
 fireEvent.click(screen.getByRole("button",{name:/^YouTube$/}));
 fireEvent.click(screen.getByRole("button",{name:"My lesson"}));
 fireEvent.click(await within(screen.getByRole("complementary",{name:"Collections"})).findByRole("button",{name:"Choose labels"}));
 const dialog=screen.getByRole("dialog");
 expect(screen.getByRole("complementary",{name:"Collections"})).toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("checkbox",{name:"YouTube"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Save"}));
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 expect(screen.getByRole("complementary",{name:"Collections"})).toBeInTheDocument();
 expect(request.mock.calls.find(call=>call[1])?.[1].operation).toMatchObject({type:"set-collection-labels",label_ids:[]});
});

test("label search preserves hidden selected assignments",async()=>{
 const otherId="00000000-0000-4000-8000-000000000003";
 request.mockResolvedValue({...snapshot,labels:[...snapshot.labels,{...snapshot.labels[0],id:otherId,name:"Books"}]});
 render(<PersonalCollections {...props}/>);await screen.findByRole("button",{name:"My lesson"});
 fireEvent.click(screen.getByRole("button",{name:"My lesson"}));
 fireEvent.click(await within(screen.getByRole("complementary",{name:"Collections"})).findByRole("button",{name:"Choose labels"}));
 const dialog=screen.getByRole("dialog");
 expect(within(dialog).getByRole("searchbox",{name:"Search labels"})).toBeVisible();
 expect(within(dialog).getByRole("heading",{name:'Labels for “My lesson”'})).toBeInTheDocument();
 fireEvent.change(within(dialog).getByRole("searchbox",{name:"Search labels"}),{target:{value:"missing-label"}});
 expect(within(dialog).getByText("No matching labels")).toBeInTheDocument();
 expect(within(dialog).queryByText("No collections found")).not.toBeInTheDocument();
 fireEvent.change(within(dialog).getByRole("searchbox",{name:"Search labels"}),{target:{value:"Books"}});
 expect(within(dialog).queryByRole("checkbox",{name:"YouTube"})).toBeNull();
 fireEvent.click(within(dialog).getByRole("checkbox",{name:"Books"}));
 fireEvent.click(within(dialog).getByRole("button",{name:"Save"}));
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 expect(request.mock.calls.find(call=>call[1])?.[1].operation.label_ids).toEqual([labelId,otherId]);
});

test('Escape dismisses an inner dialog before the collection details',async()=>{
 render(<PersonalCollections {...props}/>);await screen.findByRole('button',{name:'My lesson'});
 fireEvent.click(screen.getByRole('button',{name:'My lesson'}));
 const details=await screen.findByRole('complementary',{name:'Collections'});
 const nested=document.createElement('dialog');nested.setAttribute('open','');details.appendChild(nested);
 fireEvent.keyDown(nested,{key:'Escape'});
 expect(details).toBeInTheDocument();nested.remove();
 fireEvent.keyDown(window,{key:'Escape'});
 expect(screen.queryByRole('complementary',{name:'Collections'})).toBeNull();
});

test('mobile scope picker closes before opening an original publication invitation',async()=>{
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');const onReference=vi.fn();render(<PersonalCollections {...props} onReference={onReference}/>);
 await screen.findByText('My lesson');
 const scopeButton=screen.getAllByRole('button',{name:'All collections'}).find(button=>!button.hasAttribute('aria-pressed'))!;fireEvent.click(scopeButton);
 const scope=screen.getByRole('dialog',{name:'Choose a label'});fireEvent.click(within(scope).getByRole('button',{name:'Received group'}));
 const contents=screen.getByRole('dialog',{name:'Group contents'});fireEvent.click(within(contents).getByRole('button',{name:'Original publication'}));
 expect(onReference).toHaveBeenCalledWith('A'.repeat(26));expect(screen.queryByRole('dialog')).toBeNull();
});
