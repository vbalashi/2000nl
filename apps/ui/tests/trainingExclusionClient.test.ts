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

test("accepted exclusion/restore receipts invalidate retained availability without a mounted hook", async()=>{
 const {writeTrainingAvailabilityCache,readTrainingAvailabilityCache,onTrainingAvailabilityInvalidated}=await import("@/lib/training/availability/cache");
 const {currentAvailabilityStudyDay}=await import("@/lib/training/availability/model");
 const key='"owner":recipe';const counts={dueToday:1,totalReviews:2,newCards:3,studyDay:currentAvailabilityStudyDay("UTC"),timezone:"UTC",asOf:new Date().toISOString()};
 const notified=vi.fn();const unsubscribe=onTrainingAvailabilityInvalidated(notified);
 writeTrainingAvailabilityCache(key,counts);vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json(receipt));await performTrainingExclusion(request);expect(readTrainingAvailabilityCache(key)).toBeUndefined();expect(notified).toHaveBeenCalledTimes(1);
 const restore={actionId:"restore-headword" as const,clientEventId:id,exclusionId:id,target:request.target};writeTrainingAvailabilityCache(key,counts);vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json({...receipt,actionId:"restore-headword",excluded:false}));await performTrainingExclusion(restore);expect(readTrainingAvailabilityCache(key)).toBeUndefined();expect(notified).toHaveBeenCalledTimes(2);unsubscribe();
});
test("failed exclusion does not invalidate usable availability",async()=>{
 const {writeTrainingAvailabilityCache,readTrainingAvailabilityCache}=await import("@/lib/training/availability/cache");const {currentAvailabilityStudyDay}=await import("@/lib/training/availability/model");
 const key='"owner":recipe';writeTrainingAvailabilityCache(key,{dueToday:1,totalReviews:2,newCards:3,studyDay:currentAvailabilityStudyDay("UTC"),timezone:"UTC",asOf:new Date().toISOString()});
 vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json({error:"denied"},{status:403}));await expect(performTrainingExclusion(request)).rejects.toThrow("denied");expect(readTrainingAvailabilityCache(key)).toBeDefined();
 vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json({...receipt,excluded:false}));await expect(performTrainingExclusion(request)).rejects.toThrow();expect(readTrainingAvailabilityCache(key)).toBeDefined();
});
