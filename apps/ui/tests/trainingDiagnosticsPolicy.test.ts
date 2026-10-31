import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {diagnosticPolicyFor} from '@/lib/diagnostics/serverPolicy';
import {acceptsDiagnostic} from '@/lib/diagnostics/policy';
let directory:string,file:string;
beforeEach(()=>{vi.useFakeTimers();directory=mkdtempSync(join(tmpdir(),'training-policy-'));file=join(directory,'policy.json');vi.stubEnv('TRAINING_DIAGNOSTICS_POLICY_PATH',file);});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();rmSync(directory,{recursive:true,force:true});});
const save=(policy:object)=>{writeFileSync(file,JSON.stringify(policy));vi.advanceTimersByTime(5001);};
const event={eventId:'e',kind:'load_ready' as const,operation:'display' as const,durationMs:100,foreground:true,online:true,transitionId:'load-one'};
test('missing or malformed policy disables collection',()=>{
 expect(diagnosticPolicyFor('a').enabled).toBe(false);writeFileSync(file,'broken');expect(diagnosticPolicyFor('a').enabled).toBe(false);
 save({enabled:true,successSampleRate:2});expect(diagnosticPolicyFor('a').enabled).toBe(false);
});
test('targets one authenticated account and automatically expires its grant',()=>{
 vi.useFakeTimers();const until=Date.now()+65_001;
 save({enabled:true,successSampleRate:0,users:{a:new Date(until).toISOString()}});
 expect(diagnosticPolicyFor('a').detailed).toBe(true);expect(diagnosticPolicyFor('b').detailed).toBe(false);
 expect(diagnosticPolicyFor('a').validUntil).toBe(until);
 vi.advanceTimersByTime(60_001);expect(diagnosticPolicyFor('a').detailed).toBe(false);
});
test('kill switch overrides existing grants immediately and baseline revokes global detail',()=>{
 save({enabled:true,successSampleRate:0,detailedUntil:new Date(Date.now()+60_000).toISOString()});
 expect(diagnosticPolicyFor('a').detailed).toBe(true);
 save({enabled:false,successSampleRate:1,detailedUntil:new Date(Date.now()+60_000).toISOString()});
 expect(acceptsDiagnostic(diagnosticPolicyFor('a'),{...event,kind:'load_stalled'})).toBe(false);
});
test('baseline retains failures, samples successes consistently, and expires client policy',()=>{
 save({enabled:true,successSampleRate:0});const p=diagnosticPolicyFor('a');
 expect(acceptsDiagnostic(p,event)).toBe(false);expect(acceptsDiagnostic(p,{...event,kind:'load_stalled'})).toBe(true);
 expect(acceptsDiagnostic({...p,successSampleRate:1},event)).toBe(true);
 expect(acceptsDiagnostic({...p,validUntil:0},{...event,kind:'load_failed'})).toBe(false);
});
