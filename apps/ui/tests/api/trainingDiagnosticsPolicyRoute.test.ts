import {beforeEach,expect,test,vi} from 'vitest';
const mocks=vi.hoisted(()=>({policy:vi.fn(),auth:vi.fn(),write:vi.fn()}));
vi.mock('@/lib/diagnostics/serverPolicy',()=>({diagnosticPolicyFor:mocks.policy}));
vi.mock('@/lib/diagnostics/server',()=>({diagnosticActor:()=> 'pseudonym',writeDiagnostic:mocks.write}));
vi.mock('@/lib/platform/serverSupabase',()=>({getAuthenticatedSupabase:mocks.auth,jsonNoStore:(body:unknown,status=200)=>Response.json(body,{status})}));
import {GET,POST} from '@/app/api/diagnostics/training/route';
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({user:{id:'authenticated-user'},principal:{authKind:'first_party'}});mocks.policy.mockReturnValue({enabled:true,detailed:false,successSampleRate:0,validUntil:Date.now()+90_000});});
const event={eventId:'event',kind:'load_ready',operation:'display',durationMs:100,foreground:true,online:true};
const post=(events:object[])=>new Request('http://localhost/api/diagnostics/training',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(events)});
test('GET resolves only the authenticated account policy',async()=>{
 const result=await GET(new Request('http://localhost/api/diagnostics/training?userId=other'));
 expect(mocks.policy).toHaveBeenCalledWith('authenticated-user');expect(await result.json()).toEqual(mocks.policy.mock.results[0].value);
});
test('server rejects success events even if a stale client requests full detail',async()=>{
 await POST(post([event,{...event,eventId:'failure',kind:'load_stalled'}]));
 expect(mocks.write).toHaveBeenCalledOnce();expect(mocks.write.mock.calls[0][0].event).toBe('load_stalled');
});
test('kill switch stops ingestion from already-open clients',async()=>{
 mocks.policy.mockReturnValue({enabled:false,detailed:false,successSampleRate:0,validUntil:0});
 expect(await (await POST(post([{...event,kind:'load_failed'}]))).json()).toEqual({accepted:0});expect(mocks.write).not.toHaveBeenCalled();
});
test('connected clients cannot fetch training diagnostics policy',async()=>{
 mocks.auth.mockResolvedValue({user:{id:'other'},principal:{authKind:'connected_client'}});
 expect((await GET(new Request('http://localhost/api/diagnostics/training'))).status).toBe(403);expect(mocks.policy).not.toHaveBeenCalled();
});
