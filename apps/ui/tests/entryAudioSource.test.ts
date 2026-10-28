import {beforeEach,expect,test,vi} from "vitest";
const {service,identity}=vi.hoisted(()=>({service:vi.fn(),identity:vi.fn()}));
vi.mock("@/lib/platform/serverSupabase",()=>({getPlatformServiceSupabase:service}));
import {readEntryAudioSource} from "@/lib/audio/entryAudioSource";
const rpc=vi.fn();
const auth={user:{id:"viewer"},supabase:{rpc}} as unknown as Parameters<typeof readEntryAudioSource>[0];
const node={contentNodeId:"node-1",sourceTextFingerprint:"fingerprint-1"};
const binding={...node,kind:"example",sourcePath:"raw.meanings[0].examples[0]"};
const entry={id:"selected",headword:"huis",content_version:3,raw:{meanings:[{examples:["Een huis."]}]}};
const versioned={...entry,platform_v2_identity:{entryId:"selected",contentNodeBindings:[binding]}};
const current={sessionId:"session",permitId:"permit"};
beforeEach(()=>{vi.resetAllMocks();rpc.mockResolvedValue({data:entry,error:null});identity.mockResolvedValue({data:{items:[versioned]},error:null});service.mockReturnValue({supabase:{rpc:identity}});});
test("live node text comes from allowed source sections and caller-bound presentation identity",async()=>{
  expect(await readEntryAudioSource(auth,"selected",undefined,node)).toEqual({entry:versioned,text:"Een huis."});
  expect(identity).toHaveBeenCalledWith("read_platform_v2_library_group",{p_user_id:"viewer",p_entry_id:"selected",p_group_entry_bound:100});
});
test("current-card node uses exact embedded identity without service-role fallback",async()=>{
  const permitted={...entry,platform_v2_identity:{entryId:"selected",contentNodeBindings:[binding]}};
  rpc.mockResolvedValue({data:{items:[permitted]},error:null});
  expect(await readEntryAudioSource(auth,"selected",current,node)).toEqual({entry:permitted,text:"Een huis."});
  expect(service).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("read_current_training_entry_v1",{p_user_id:"viewer",p_session_id:"session",p_permit_id:"permit"});
});
test.each(["denied","error","wrong-entry"])("%s library source is denied",async kind=>{
  identity.mockResolvedValue({data:kind==="denied"?null:{items:[{...versioned,...(kind==="wrong-entry"?{id:"hidden"}:{})}]},error:kind==="error"?{message:"private"}:null});
  expect(await readEntryAudioSource(auth,"selected",undefined,node)).toBeNull();expect(rpc).not.toHaveBeenCalled();
});
test.each(["missing","fingerprint","duplicate","kind","path","identity-owner","identity-error"])("%s binding is denied",async kind=>{
  identity.mockResolvedValue({error:kind==="identity-error"?{message:"private"}:null,data:{items:[{...entry,platform_v2_identity:{entryId:kind==="identity-owner"?"hidden":"selected",contentNodeBindings:kind==="missing"?[]:kind==="duplicate"?[binding,binding]:[{...binding,...(kind==="fingerprint"?{sourceTextFingerprint:"old"}:{}),...(kind==="kind"?{kind:"usage-note"}:{}),...(kind==="path"?{sourcePath:"raw.diagnostics"}:{})}]}}]}});
  expect(await readEntryAudioSource(auth,"selected",undefined,node)).toBeNull();
});
test("idiom expression is supported through its instructional binding",async()=>{
  identity.mockResolvedValue({data:{items:[{...entry,
    raw:{meanings:[{idioms:[{expression:"de maan in een rugzak dragen"}]}]},
    platform_v2_identity:{entryId:"selected",contentNodeBindings:[{...binding,kind:"idiom",sourcePath:"raw.meanings[0].idioms[0]"}]},
  }]},error:null});
  expect((await readEntryAudioSource(auth,"selected",undefined,node))?.text).toBe("de maan in een rugzak dragen");
});
