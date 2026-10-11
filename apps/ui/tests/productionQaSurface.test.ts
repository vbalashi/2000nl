import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// The operational probe is intentionally a standalone Node/browser script.
// @ts-expect-error Standalone .mjs script has no declaration file.
import { surfaceProbeExpression } from "../../../scripts/lib/wait-for-prod-qa-surface.mjs";
const readyHtml = `<nav aria-label="Primary"></nav><main data-training-pilot-surface="today" aria-hidden="false"><section aria-label="Current"><h2>Переводы</h2><dl><dt>Done</dt><dd>6</dd></dl></section><section aria-label="Saved"><h2>Opgeslagen trainingen</h2></section></main>`;
const probe = () =>
  new Function("document", "localStorage", `return ${surfaceProbeExpression}`)(
    document,
    globalThis.localStorage,
  );
beforeEach(() => {
  vi.stubGlobal("localStorage", {
    "sb-test-auth-token": "session",
    getItem: () =>
      JSON.stringify({
        access_token: "test",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
  });
  document.body.innerText = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
describe("production QA ready overview detection", () => {
  test("recognizes current multilingual overview without retired Today labels", () => {
    document.body.innerHTML = readyHtml;
    expect(probe()).toBe("QA_SURFACE:TODAY");
  });
  test.each([
    '<div role="alert">Failed</div>',
    '<div aria-busy="true">Preparing</div>',
  ])("loading/error is not readiness: %s", (state) => {
    document.body.innerHTML = readyHtml.replace("</main>", `${state}</main>`);
    expect(probe()).toBe("QA_SURFACE:AUTHENTICATED_OTHER");
  });
  test("hidden old overview is not ready", () => {
    document.body.innerHTML = readyHtml.replace(
      'aria-hidden="false"',
      'aria-hidden="true"',
    );
    expect(probe()).toBe("QA_SURFACE:AUTHENTICATED_OTHER");
  });
  test("Today text without authentication cannot bypass the auth check", () => {
    document.body.innerText = "Training · Today";
    vi.stubGlobal("localStorage", {});
    expect(probe()).toBe("QA_SURFACE:UNAUTHENTICATED");
  });
});
