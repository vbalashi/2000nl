import React from "react";
import {beforeAll, beforeEach, expect, test, vi} from "vitest";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {PersonalCollections} from "@/components/library/organization/PersonalCollections";
import {LabelsRequestError} from "@/lib/collections/labels/client";
const {request,create} = vi.hoisted(()=>({request:vi.fn(),create:vi.fn()}));
vi.mock("@/lib/collections/labels/client",()=>({requestLabels:request,LabelsRequestError:class extends Error {constructor(readonly code:string){super(code);}}}));
vi.mock("@/lib/training/listService",()=>({createUserList:create,updateUserList:vi.fn(),deleteUserList:vi.fn()}));
const labelId="00000000-0000-4000-8000-000000000001";
const collectionId="00000000-0000-4000-8000-000000000002";
const snapshot={revision:4,labels:[{id:labelId,parent_id:null,name:"YouTube",description:null,created_at:"2026-10-25",updated_at:"2026-10-25"}],assignments:[{label_id:labelId,collection_id:collectionId}]};
const props={active:true,userId:"owner",language:"nl",locale:"en" as const,collections:[{id:collectionId,name:"My lesson",type:"user" as const,item_count:2}],onReload:vi.fn().mockResolvedValue(undefined),onOpen:vi.fn()};
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};});
beforeEach(()=>{vi.clearAllMocks();request.mockResolvedValue(snapshot);});
test("unlabelled projection changes only display; open keeps exact collection identity",async()=>{
 render(<PersonalCollections {...props}/>);await screen.findByText("My lesson");
 fireEvent.click(screen.getByRole("button",{name:"Unlabelled"}));expect(screen.queryByText("My lesson")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"All collections"}));fireEvent.click(screen.getByRole("button",{name:"My lesson"}));
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
 expect(within(dialog).getByLabelText("Parent label")).toHaveValue("");
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
