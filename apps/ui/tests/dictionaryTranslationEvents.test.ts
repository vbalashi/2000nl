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
 const emit=(data:unknown)=>window.dispatchEvent(new StorageEvent("storage",{key:"2000nl.dictionary-translation.invalidation.v1",newValue:JSON.stringify(data)}));
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
