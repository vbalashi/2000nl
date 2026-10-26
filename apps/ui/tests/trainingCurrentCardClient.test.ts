import { afterEach, expect, test, vi } from "vitest";
import { acknowledgeCurrentTrainingCard, readCurrentTrainingCard } from "@/lib/platform/trainingCurrentCardClient";
import { singleSenseEntry, singleSenseGroup } from "./platformV2TrainingFixture";
const {headers}=vi.hoisted(()=>({headers:vi.fn()}));
vi.mock("@/lib/platform/platformV2Http",()=>({platformV2AuthenticatedJsonHeaders:headers}));
afterEach(()=>{vi.unstubAllGlobals();headers.mockReset();});
const target={sessionId:"run",entryId:singleSenseEntry.entryId,cardTypeId:"word-to-definition",sourceVersion:2,stateRevision:"revision"};
test("acknowledgement binds expected account and exact source/state identity",async()=>{
 headers.mockResolvedValue({authorization:"Bearer fake"});
 const permit={permitId:"75300000-0000-4000-8000-000000000001",expiresAt:new Date(Date.now()+60_000).toISOString(),runGeneration:3};
 const fetchMock=vi.fn().mockResolvedValue(Response.json(permit));vi.stubGlobal("fetch",fetchMock);
 expect(await acknowledgeCurrentTrainingCard("owner",target)).toEqual(permit);
 expect(headers).toHaveBeenCalledWith("owner");
 expect(fetchMock.mock.calls[0][0]).toBe("/api/platform/v2/training/current-card");
 expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({operation:"acknowledge",...target});
});
test("account-change or cancellation during credentials never sends the old target",async()=>{
 const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
 headers.mockRejectedValueOnce(new Error("auth_account_changed"));
 await expect(acknowledgeCurrentTrainingCard("old",target)).rejects.toThrow("auth_account_changed");
 let release!:(headers:object)=>void;headers.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const controller=new AbortController();const pending=acknowledgeCurrentTrainingCard("owner",target,controller.signal);controller.abort();release({});
 await expect(pending).rejects.toMatchObject({name:"AbortError"});expect(fetchMock).not.toHaveBeenCalled();
});
test("archived-card reads use only explicit permit endpoint and reject unrelated article results",async()=>{
 headers.mockResolvedValue({});
 const payload={contractVersion:"platform-lookup-v2",query:singleSenseGroup.header.text,
 request:{contentLanguageCode:"nl",translationTargetLanguageCode:null,cardTypeId:"word-to-definition",intent:"training-review"},
 groups:[singleSenseGroup],page:{selectedTierComplete:true,nextGroupCursor:null}};
 const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(Response.json(payload)));vi.stubGlobal("fetch",fetchMock);
 const input={sessionId:"run",permitId:"75300000-0000-4000-8000-000000000001",entryId:singleSenseEntry.entryId,cardTypeId:"word-to-definition",contentLanguageCode:"nl",translationTargetLanguageCode:null};
 await expect(readCurrentTrainingCard("owner",input)).resolves.toMatchObject({groups:[singleSenseGroup]});
 expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({operation:"read",...input});
 await expect(readCurrentTrainingCard("owner",{...input,entryId:"unrelated"})).rejects.toThrow("current_card_contract_invalid");
});
