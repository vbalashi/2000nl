import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const {request}=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('@/lib/preferences/accountRequest',()=>({authenticatedAccountRequest:request}));
import {fetchTrainingAvailability} from '@/lib/training/availability/client';
import type {TrainingAvailabilityRecipe} from '@/lib/training/availability/model';
const recipe={} as TrainingAvailabilityRecipe;
const value={dueToday:2,totalReviews:4,newCards:1,studyDay:'2026-10-06',timezone:'Europe/Amsterdam',asOf:'2026-10-06T12:00:00Z'};
beforeEach(()=>{vi.useFakeTimers();request.mockReset();});
afterEach(()=>{vi.useRealTimers();});
test('temporary server failure and network failure recover automatically',async()=>{
 request.mockResolvedValueOnce(new Response(null,{status:503})).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(Response.json(value));
 const pending=fetchTrainingAvailability('owner',recipe,new AbortController().signal);
 await vi.advanceTimersByTimeAsync(2000);
 expect(await pending).toEqual(value);expect(request).toHaveBeenCalledTimes(3);
});
test('per-attempt timeout retries with a fresh signal',async()=>{
 request.mockImplementationOnce((_url,_owner,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)))).mockResolvedValueOnce(Response.json(value));
 const pending=fetchTrainingAvailability('owner',recipe,new AbortController().signal);
 await vi.advanceTimersByTimeAsync(15500);
 expect(await pending).toEqual(value);expect(request).toHaveBeenCalledTimes(2);
});
test('access errors are not retried',async()=>{
 request.mockResolvedValue(new Response(null,{status:403}));
 await expect(fetchTrainingAvailability('owner',recipe,new AbortController().signal)).rejects.toThrow();
 expect(request).toHaveBeenCalledTimes(1);
});
test('all attempts exhausted remain a bounded error',async()=>{
 request.mockResolvedValue(new Response(null,{status:503}));
 const pending=expect(fetchTrainingAvailability('owner',recipe,new AbortController().signal)).rejects.toThrow();
 await vi.advanceTimersByTimeAsync(2000);await pending;expect(request).toHaveBeenCalledTimes(3);
});
test('scope cancellation during backoff prevents further requests',async()=>{
 request.mockResolvedValue(new Response(null,{status:503}));const controller=new AbortController();
 const pending=expect(fetchTrainingAvailability('owner',recipe,controller.signal)).rejects.toBeDefined();
 await vi.advanceTimersByTimeAsync(100);controller.abort();await pending;
 await vi.advanceTimersByTimeAsync(50000);expect(request).toHaveBeenCalledTimes(1);
});
