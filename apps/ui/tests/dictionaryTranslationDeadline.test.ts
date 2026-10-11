import {expect,test,vi} from "vitest";
import {withDictionaryTranslationDeadline} from "@/lib/translation/dictionaryTranslationDeadline";
import {DICTIONARY_TRANSLATION_OPERATION_MS,DICTIONARY_TRANSLATION_PENDING_MS,DICTIONARY_TRANSLATION_CLIENT_MS} from "@/lib/translation/dictionaryTranslationBudgets";

test("a stalled generic or fallback provider cannot retain the server operation forever",async()=>{
  vi.useFakeTimers();
  try {
    let resolve!: (value:string)=>void;
    const result=withDictionaryTranslationDeadline(()=>new Promise<string>(r=>{resolve=r;}));
    const verdict=result.catch(error=>error.message);
    await vi.advanceTimersByTimeAsync(DICTIONARY_TRANSLATION_OPERATION_MS);
    expect(await verdict).toMatch(/^provider_timeout:/);
    resolve("late result");
    expect(await verdict).toMatch(/^provider_timeout:/);
    expect(vi.getTimerCount()).toBe(0);
    expect(DICTIONARY_TRANSLATION_CLIENT_MS).toBeGreaterThan(DICTIONARY_TRANSLATION_OPERATION_MS);
    expect(DICTIONARY_TRANSLATION_PENDING_MS).toBeGreaterThan(DICTIONARY_TRANSLATION_CLIENT_MS);
  } finally {vi.useRealTimers();}
});
