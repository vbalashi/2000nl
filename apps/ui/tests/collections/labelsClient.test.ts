import {beforeEach, expect, test, vi} from "vitest";
const {session} = vi.hoisted(()=>({session:vi.fn()}));
vi.mock("@/lib/supabaseClient",()=>({supabase:{auth:{getSession:session}}}));
import {requestLabels} from "@/lib/collections/labels/client";
beforeEach(()=>{vi.restoreAllMocks();session.mockReset();});
test("account change before request never sends another account's operation",async()=>{
 session.mockResolvedValue({data:{session:{user:{id:"other"},access_token:"other-token"}}});
 const fetcher=vi.spyOn(globalThis,"fetch");
 await expect(requestLabels(new AbortController().signal,undefined,"owner")).rejects.toThrow("auth_account_changed");
 expect(fetcher).not.toHaveBeenCalled();
});
test("unmount while obtaining credentials aborts before any write is sent",async()=>{
 const controller=new AbortController();
 session.mockImplementation(async()=>{controller.abort();return {data:{session:{user:{id:"owner"},access_token:"owner-token"}}};});
 const fetcher=vi.spyOn(globalThis,"fetch");
 await expect(requestLabels(controller.signal,{expectedRevision:1,operation:{type:"delete",id:"00000000-0000-4000-8000-000000000001"}},"owner")).rejects.toThrow();
 expect(fetcher).not.toHaveBeenCalled();
});
