import { NextRequest } from "next/server";
import { beforeEach,expect,test,vi } from "vitest";
const { auth,rpc } = vi.hoisted(() => ({ auth:vi.fn(),rpc:vi.fn() }));
vi.mock("@/lib/platform/serverSupabase",() => ({ getAuthenticatedSupabase:auth,jsonNoStore:(body:unknown,status=200) => Response.json(body,{status,headers:{"cache-control":"no-store"}}) }));
import { GET,POST } from "@/app/api/training/study-time/route";
const id = "00000000-0000-4000-8000-000000000001";
const measurement = { measurementId:id,sessionId:id,family:"meaning",entryId:id,cardTypeId:"word-to-definition",targetId:null,activeMilliseconds:15000,observedAt:"2026-09-30T10:00:00Z" };
const post = (body:unknown=measurement) => new NextRequest("http://localhost/api/training/study-time",{method:"POST",body:JSON.stringify(body)});
const get = (suffix="?start=2026-09-30&end=2026-09-30&language=nl") => new NextRequest(`http://localhost/api/training/study-time${suffix}`);
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({supabase:{rpc},principal:{authKind:"first_party"},user:{id}}); rpc.mockResolvedValue({data:{accepted:true,duplicate:false},error:null}); });
test("authenticates before parsing or reading; connected clients cannot use the app-local endpoint",async () => {
  auth.mockResolvedValue(Response.json({error:"unauthorized"},{status:401}));
  expect((await POST(post())).status).toBe(401); expect((await GET(get())).status).toBe(401);
  auth.mockResolvedValue({principal:{authKind:"connected_client"}});
  expect((await POST(post())).status).toBe(403); expect((await GET(get())).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
test("passes canonical bounded metadata, never a client user/material/day identity",async () => {
  const response = await POST(post()); expect(await response.json()).toEqual({accepted:true,duplicate:false});
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(rpc).toHaveBeenCalledWith("record_training_active_time_v1",{p_measurement_id:id,p_session_id:id,p_family:"meaning",p_entry_id:id,p_card_type_id:"word-to-definition",p_target_id:null,p_active_ms:15000,p_observed_at:"2026-09-30T10:00:00.000Z"});
  expect((await POST(post({...measurement,userId:"victim"}))).status).toBe(400);
});
test("rejects invalid families, identifiers, lengths, duration and timestamp before RPC",async () => {
  for (const value of [{...measurement,activeMilliseconds:30001},{...measurement,activeMilliseconds:1.5},{...measurement,sessionId:"fake"},{...measurement,family:"sentence"},{...measurement,observedAt:"yesterday"},{...measurement,cardTypeId:"review"}])
    expect((await POST(post(value))).status).toBe(400);
  expect((await POST(post({padding:"x".repeat(3000)}))).status).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});
test("surfaces replay, ownership, stale window and service failure without changing actions",async () => {
  rpc.mockResolvedValue({data:{accepted:true,duplicate:true},error:null});
  expect(await (await POST(post())).json()).toEqual({accepted:true,duplicate:true});
  for (const [error,status] of [["measurement_conflict",409],["measurement_not_owned",403],["measurement_out_of_window",400]] as const) {
    rpc.mockResolvedValue({data:{error},error:null}); expect((await POST(post())).status).toBe(status);
  }
  rpc.mockResolvedValue({data:{accepted:true,duplicate:"bad"},error:null}); expect((await POST(post())).status).toBe(503);
  rpc.mockRejectedValue(new Error("private DB error")); expect(await (await POST(post())).json()).toEqual({error:"study_time_unavailable"});
});
test("reads validated daily durations with explicit coverage and no client timezone/user",async () => {
  const page = {coverageStartedAt:"2026-09-30T09:00:00Z",timezone:"Europe/Amsterdam",days:[{date:"2026-09-30",activeMilliseconds:12345}]};
  rpc.mockResolvedValue({data:{...page,internalMetadata:"not-a-public-field"},error:null}); const response = await GET(get());
  expect(await response.json()).toEqual(page); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(rpc).toHaveBeenCalledWith("get_training_active_time_v1",{p_start_date:"2026-09-30",p_end_date:"2026-09-30",p_language_code:"nl"});
  rpc.mockResolvedValue({data:{...page,days:[]},error:null}); expect((await GET(get())).status).toBe(503);
  rpc.mockResolvedValue({data:{...page,days:[{date:"2026-09-30",activeMilliseconds:-1}]},error:null}); expect((await GET(get())).status).toBe(503);
});
test("rejects excessive/invalid calendar ranges and unsupported scope hints",async () => {
  for (const suffix of ["?start=2026-02-30&end=2026-03-01","?start=2026-09-30&end=2026-09-01","?start=2025-01-01&end=2026-01-02","?start=2026-09-30&end=2026-09-30&userId=victim","?start=2026-09-30&end=2026-09-30&language=bad_lang"]) expect((await GET(get(suffix))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
