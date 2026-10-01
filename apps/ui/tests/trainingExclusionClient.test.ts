import { beforeEach, expect, test, vi } from "vitest";
import { performTrainingExclusion } from "@/lib/platform/trainingExclusionClient";
import { platformFetchWithTimeout } from "@/lib/platform/platformFetchWithTimeout";
vi.mock("@/lib/platform/platformV2Http",()=>({platformV2AuthenticatedJsonHeaders:async()=>({})}));
vi.mock("@/lib/platform/platformFetchWithTimeout",()=>({platformFetchWithTimeout:vi.fn()}));
const id="00000000-0000-4000-8000-000000000001";
const request={actionId:"exclude-headword" as const,clientEventId:id,target:{kind:"headword" as const,entryId:id}};
const receipt={status:"accepted",actionId:request.actionId,clientEventId:id,exclusionId:id,headwordGroupId:id,excluded:true,family:"meaning"};
beforeEach(()=>{vi.clearAllMocks();});
test("validates the headword receipt and posts the exact Library intent without a session",async()=>{
 vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json(receipt));
 expect(await performTrainingExclusion(request)).toEqual(receipt);
 const [url,options]=vi.mocked(platformFetchWithTimeout).mock.calls[0];
 expect(url).toBe("/api/platform/v2/training/exclusions");expect(JSON.parse(options!.body as string)).toEqual(request);
});
test.each([{...receipt,headwordGroupId:undefined},{...receipt,headwordGroupId:"spelling"},{...receipt,family:"idiom"},{...receipt,actionId:"exclude-pair"},{...receipt,excluded:false}])("rejects incomplete or wrong-scope receipts",async value=>{
 vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json(value));
 await expect(performTrainingExclusion(request)).rejects.toThrow("invalid_training_exclusion_response");
});
