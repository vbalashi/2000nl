import { describe, expect, test, vi } from "vitest";
import { withTranslationRetries, safeProviderRequestId, retryAfterMs, type TranslationAttemptDiagnostic, type TranslationAttemptLog } from "@/lib/translation/translationRetry";
describe("translation transient recovery", () => {
  test("allows three retries, logs every attempt and preserves known usage", async () => {
    const logs: TranslationAttemptLog[] = [], waits:number[]=[]; let n = 0;
    const result = await withTranslationRetries(async d => {
      n++; d.status = n < 4 ? 500 : 200; d.stage = "response"; d.requestId = "request-1";
      if (n < 4) throw new Error("secret raw provider message");
      d.inputTokens = 12; d.outputTokens = 4; return "ok";
    }, { classify: () => "provider_http_error", log: e => logs.push(e), sleep: async ms => {waits.push(ms);} });
    expect(result).toBe("ok"); expect(n).toBe(4); expect(waits).toEqual([300,600,1200]);
    expect(new Set(logs.map(e => e.correlationId)).size).toBe(1);
    expect(logs.map(e => e.retry)).toEqual([true,true,true,false]);
    expect(logs[3]).toMatchObject({ inputTokens:12, outputTokens:4, outcome:"ready" });
    expect(JSON.stringify(logs)).not.toContain("secret");
  });
  test.each([400,401,403,404,422])("does not retry permanent HTTP %s", async status => {
    const call = vi.fn(async (d:TranslationAttemptDiagnostic) => { d.status = status; throw new Error("failure"); });
    await expect(withTranslationRetries(call, { classify: () => "provider_http_error", log: () => {}, sleep: vi.fn() })).rejects.toThrow("failure"); expect(call).toHaveBeenCalledTimes(1);
  });
  test.each(["provider_timeout","provider_network_error"] as const)("exhausts transient %s at four calls", async code => {
    const call = vi.fn(async () => { throw new Error("failure"); }), logs: TranslationAttemptLog[]=[];
    await expect(withTranslationRetries(call, { classify: () => code, log: e => logs.push(e), sleep: async () => {} })).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(4); expect(logs[3].retry).toBe(false);
  });
  test("honors bounded Retry-After and never retries contract errors", async () => {
    const sleeps:number[]=[];let n=0;
    await withTranslationRetries(async d => { if (++n===1) { d.status=429; d.retryAfterMs=2000; throw new Error(); } return 1; }, { classify: () => "provider_http_error", log: () => {}, sleep: async ms => {sleeps.push(ms);} });
    expect(sleeps).toEqual([2000]);
    const call=vi.fn(async (d:TranslationAttemptDiagnostic) => {d.stage="contract";throw new Error("bad JSON");});
    await expect(withTranslationRetries(call,{classify:()=>"provider_response_error",log:()=>{}})).rejects.toThrow("bad JSON");expect(call).toHaveBeenCalledTimes(1);
    expect(retryAfterMs("999999")).toBe(30000);expect(retryAfterMs("bogus")).toBeUndefined();
    expect(safeProviderRequestId("valid-123")).toBe("valid-123");expect(safeProviderRequestId("https://secret?key=x")).toBeUndefined();
  });
});

import { OpenAITranslator } from "@/lib/translation/openaiTranslator";
test("provider wiring retries 500 three times with safe diagnostics", async () => {
  const fetchMock=vi.fn(async () => new Response('{"error":{"message":"secret provider body"}}',{status:500,headers:{"x-request-id":"request-safe"}}));
  vi.stubGlobal("fetch",fetchMock);const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  try {
    const translator=new OpenAITranslator({apiKey:"secret-key",model:"gpt-4.1"});
    await expect(translator.translate("secret input","ru")).rejects.toThrow("provider_http_error");
    expect(fetchMock).toHaveBeenCalledTimes(4);expect(log).toHaveBeenCalledTimes(4);
    expect(log.mock.calls[3][1]).toMatchObject({attempt:4,status:500,requestId:"request-safe",reason:"http_status",retry:false});
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  } finally {vi.unstubAllGlobals();log.mockRestore();}
});
test("malformed HTTP200 is a response error, not a network retry", async () => {
  const fetchMock=vi.fn(async()=>new Response('invalid JSON',{status:200}));vi.stubGlobal("fetch",fetchMock);
  const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  try {
    await expect(new OpenAITranslator({apiKey:"key"}).translate("text","ru")).rejects.toThrow("provider_response_error");
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(log.mock.calls[0][1]).toMatchObject({reason:"invalid_json",retry:false});
  } finally {vi.unstubAllGlobals();log.mockRestore();}
});
