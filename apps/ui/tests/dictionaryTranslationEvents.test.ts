const { remote, connection } = vi.hoisted(() => ({ remote: vi.fn(), connection: vi.fn() }));
vi.mock("@/lib/events/appEvents", () => ({
 appTranslationTopic: (entryId: string, language: string) => `app:translation:${entryId}:${language}`,
 subscribeAppEvents: remote, subscribeAppEventConnection: connection,
}));
import { afterEach, expect, test, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
test("two independently loaded tabs deliver invalidation once without echo or text", async () => {
  const channels: any[] = [];
  class Channel {
    onmessage: ((event: any) => void) | null = null;
    constructor(public name: string) {
      channels.push(this);
    }
    postMessage(message: any) {
      for (const c of channels)
        if (c !== this && c.name === this.name)
          c.onmessage?.({ data: message });
    }
    close() {}
  }
  vi.stubGlobal("BroadcastChannel", Channel);
  const first = await import("@/lib/translation/dictionaryTranslationEvents");
  vi.resetModules();
  const second = await import("@/lib/translation/dictionaryTranslationEvents");
  const a = vi.fn(),
    b = vi.fn();
  const detachA = first.onDictionaryTranslationReady(a),
    detachB = second.onDictionaryTranslationReady(b);
  first.publishDictionaryTranslationReady({
    entryId: "entry",
    targetLanguageCode: "ru",
  });
  expect(a).toHaveBeenCalledOnce();
  expect(b).toHaveBeenCalledOnce();
  expect(b).toHaveBeenCalledWith({
    entryId: "entry",
    targetLanguageCode: "ru",
  });
  detachA();
  detachB();
});

test("storage fallback ignores malformed/private payloads, deduplicates, and never echoes",async()=>{
 vi.stubGlobal("BroadcastChannel",undefined);
 const bus=await import("@/lib/translation/dictionaryTranslationEvents");const listener=vi.fn();const detach=bus.onDictionaryTranslationReady(listener);
 const emit=(data:unknown)=>window.dispatchEvent(new StorageEvent("storage",{key:"2000nl.dictionary-translation.invalidation.v1",newValue:JSON.stringify(data)})); // gitleaks:allow -- same browser event storage key
 const event={type:"ready",id:"id",entryId:"entry",targetLanguageCode:"ru"};
 emit({...event,text:"must not cross tabs"});expect(listener).not.toHaveBeenCalled();
 emit(event);emit(event);expect(listener).toHaveBeenCalledOnce();detach();emit({...event,id:"next"});expect(listener).toHaveBeenCalledOnce();
});
test("focus, visibility and periodic recovery revalidate only a visible document and detach cleanly",async()=>{
 vi.useFakeTimers();vi.stubGlobal("BroadcastChannel",undefined);
 const bus=await import("@/lib/translation/dictionaryTranslationEvents");const listener=vi.fn();const detach=bus.onDictionaryTranslationRevalidate(listener);
 Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});window.dispatchEvent(new Event("focus"));vi.advanceTimersByTime(60_000);expect(listener).not.toHaveBeenCalled();
 Object.defineProperty(document,"visibilityState",{value:"visible",configurable:true});document.dispatchEvent(new Event("visibilitychange"));expect(listener).toHaveBeenCalledOnce();vi.advanceTimersByTime(60_000);expect(listener).toHaveBeenCalledTimes(2);
 detach();window.dispatchEvent(new Event("focus"));expect(listener).toHaveBeenCalledTimes(2);vi.useRealTimers();
});


test("scoped remote hints trigger targeted authoritative readers without local echo", async () => {
 const stopEvent=vi.fn(),stopConnection=vi.fn();
 let receive!: (event: {resourceId:string;language:string})=>void;
 remote.mockImplementation((_options,listener)=>{receive=listener;return stopEvent;});
 connection.mockReturnValue(stopConnection);
 const bus=await import("@/lib/translation/dictionaryTranslationEvents");
 const scoped=vi.fn(),other=vi.fn();
 const detachOther=bus.onDictionaryTranslationReady(other);
 const detach=bus.onDictionaryTranslationReady(scoped,{entryId:"entry",targetLanguageCode:"ru"});
 expect(remote).toHaveBeenCalledWith(expect.objectContaining({topic:"app:translation:entry:ru",kinds:["translation.ready","translation.failed"]}),expect.any(Function));
 receive({resourceId:"different",language:"ru"});expect(scoped).not.toHaveBeenCalled();
 receive({resourceId:"entry",language:"ru"});expect(scoped).toHaveBeenCalledOnce();
 expect(other).not.toHaveBeenCalled();
 detach();detachOther();expect(stopEvent).toHaveBeenCalledOnce();expect(stopConnection).toHaveBeenCalledOnce();
});

test("scoped readers recover once on first connection and once per reconnect", async () => {
 let state!: (value:{status:string;reconnect:boolean})=>void;
 remote.mockReturnValue(vi.fn());
 connection.mockImplementation((_topic,listener)=>{state=listener;return vi.fn();});
 const bus=await import("@/lib/translation/dictionaryTranslationEvents");const listener=vi.fn();
 const detach=bus.onDictionaryTranslationReady(listener,{entryId:"entry",targetLanguageCode:"ru"});
 state({status:"connected",reconnect:false});expect(listener).toHaveBeenCalledOnce();
 state({status:"connected",reconnect:false});expect(listener).toHaveBeenCalledOnce();
 state({status:"degraded",reconnect:false});
 state({status:"connected",reconnect:true});expect(listener).toHaveBeenCalledTimes(2);
 detach();
});

test("healthy scopes avoid minute lookups while degraded scopes keep recovery", async () => {
 vi.useFakeTimers();
 Object.defineProperty(document,"visibilityState",{value:"visible",configurable:true});
 const states = new Map<string,(value:{status:string;reconnect:boolean})=>void>();
 remote.mockReturnValue(vi.fn());
 connection.mockImplementation((topic,listener)=>{states.set(topic,listener);listener({status:"connected",reconnect:false});return vi.fn();});
 const bus=await import("@/lib/translation/dictionaryTranslationEvents");
 const healthy=vi.fn(),degraded=vi.fn();
 const stopA=bus.onDictionaryTranslationRevalidate(healthy,{entryId:"healthy",targetLanguageCode:"ru"});
 const stopB=bus.onDictionaryTranslationRevalidate(degraded,{entryId:"degraded",targetLanguageCode:"ru"});
 states.get("app:translation:degraded:ru")!({status:"degraded",reconnect:false});
 vi.advanceTimersByTime(60_000);
 expect(healthy).not.toHaveBeenCalled();expect(degraded).toHaveBeenCalledOnce();
 vi.advanceTimersByTime(14*60_000);
 expect(healthy).toHaveBeenCalledOnce();expect(degraded).toHaveBeenCalledTimes(15);
 window.dispatchEvent(new Event("focus"));expect(healthy).toHaveBeenCalledTimes(2);
 stopA();stopB();vi.useRealTimers();
});
