import { afterEach, describe, expect, test, vi } from "vitest";
import { requestPlatformV2Lookup } from "@/lib/platform/platformV2LookupTransport";
import { PLATFORM_CARD_TYPE_IDS } from "@/lib/platform/cardTypeRegistry";
import { PLATFORM_V2_CARD_TYPE_IDS } from "../../../packages/shared/types/platformV2";
import { financeEntry, multiSenseBankGroup } from "./platformV2LibraryFixture";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const body = {
  entryId: "entry-1",
  cardTypeId: "word-to-definition" as const,
  contentLanguageCode: "nl",
  translationTargetLanguageCode: "en",
  intent: "training-review" as const,
};

describe("requestPlatformV2Lookup", () => {
  test("uses the same supported card types for requests and response validation", () => {
    expect(PLATFORM_CARD_TYPE_IDS).toEqual(PLATFORM_V2_CARD_TYPE_IDS);
  });

  test("returns a validated V2 payload and authenticated response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            contractVersion: "platform-lookup-v2",
            query: "hand",
            request: body,
            groups: [],
            page: { selectedTierComplete: true, nextGroupCursor: null },
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await requestPlatformV2Lookup({ body });

    expect(result.state).toBe("ready");
    expect(fetch).toHaveBeenCalledWith(
      "/api/platform/v2/lookup",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({ authorization: "Bearer test-token" }),
      }),
    );
  });

  test.each([401, 403, 404, 500, 503])(
    "classifies HTTP %s without discarding its status",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{}", { status })),
      );

      await expect(requestPlatformV2Lookup({ body })).resolves.toMatchObject({
        state: "http-error",
        status,
      });
    },
  );

  test("classifies invalid JSON or contract shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ contractVersion: "unexpected" }), {
          status: 200,
        }),
      ),
    );

    await expect(requestPlatformV2Lookup({ body })).resolves.toMatchObject({
      state: "contract-mismatch",
    });
  });

  test.each([
    { request: {} },
    { groups: [{}] },
    { groups: [{ entries: [null] }] },
    { page: { selectedTierComplete: "yes", nextGroupCursor: null } },
  ])("rejects malformed nested contract data %#", async (override) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          contractVersion: "platform-lookup-v2",
          query: "hand",
          request: body,
          groups: [],
          page: { selectedTierComplete: true, nextGroupCursor: null },
          ...override,
        }), { status: 200 }),
      ),
    );
    await expect(requestPlatformV2Lookup({ body })).resolves.toMatchObject({
      state: "contract-mismatch",
    });
  });

  test.each([
    {
      label: "card",
      group: {
        ...multiSenseBankGroup,
        entries: [{ ...financeEntry, card: {} }],
      },
    },
    {
      label: "content-node translation",
      group: {
        ...multiSenseBankGroup,
        entries: [{
          ...financeEntry,
          contentNodes: [{
            ...financeEntry.contentNodes[0],
            translations: [{ status: "ready" }],
          }],
        }],
      },
    },
    {
      label: "capability target",
      group: {
        ...multiSenseBankGroup,
        entries: [{
          ...financeEntry,
          capabilities: [{
            actionId: "start-learning",
            elementId: "learn",
            messageKey: "learn",
            target: {},
          }],
        }],
      },
    },
    {
      label: "content-node kind",
      group: {
        ...multiSenseBankGroup,
        entries: [{
          ...financeEntry,
          contentNodes: [{ ...financeEntry.contentNodes[0], kind: "script" }],
        }],
      },
    },
    {
      label: "translation status",
      group: {
        ...multiSenseBankGroup,
        entries: [{
          ...financeEntry,
          contentNodes: [{
            ...financeEntry.contentNodes[0],
            translations: [{
              translationId: "translation-1",
              targetLanguageCode: "en",
              status: "invented",
              sourceTextFingerprint: "fingerprint-1",
              translationPolicyVersion: "v1",
            }],
          }],
        }],
      },
    },
    {
      label: "word details",
      group: {
        ...multiSenseBankGroup,
        entries: [{ ...financeEntry, wordDetails: { forms: null } }],
      },
    },
    {
      label: "action-target pairing",
      group: {
        ...multiSenseBankGroup,
        entries: [{
          ...financeEntry,
          capabilities: [{
            actionId: "review-card",
            elementId: "review",
            messageKey: "review",
            reviewResult: "success",
            target: {
              kind: "entry",
              entryId: financeEntry.entryId,
              contentRevision: financeEntry.contentRevision,
            },
          }],
        }],
      },
    },
  ])("rejects a malformed nested $label before consumers run", async ({ group }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          contractVersion: "platform-lookup-v2",
          query: "bank",
          request: body,
          groups: [group],
          page: { selectedTierComplete: true, nextGroupCursor: null },
        }), { status: 200 }),
      ),
    );

    await expect(requestPlatformV2Lookup({ body })).resolves.toMatchObject({
      state: "contract-mismatch",
    });
  });

  test("accepts the complete optional word-details subtree", async () => {
    const group = {
      ...multiSenseBankGroup,
      entries: [{
        ...financeEntry,
        wordDetails: {
          entryId: financeEntry.entryId,
          lexicalRelations: [{ relationId: "relation-1", kind: "synonym", text: "geldbank" }],
          labels: [{ termId: "label.formal", messageKey: "label.formal", sourceValue: "formeel" }],
          grammarNotes: [{ detailId: "grammar-1", text: "grammar" }],
          usageNotes: [{ detailId: "usage-1", text: "usage", contentNodeId: "definition-bank-finance" }],
          pronunciationNotes: [],
          forms: [{
            formId: "form-1",
            kind: { termId: "form.plural", messageKey: "form.plural" },
            text: "banken",
            features: [],
          }],
          references: [{
            referenceId: "reference-1",
            kind: { termId: "reference.see", messageKey: "reference.see" },
            text: "bankieren",
          }],
        },
      }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        contractVersion: "platform-lookup-v2",
        query: "bank",
        request: body,
        groups: [group],
        page: { selectedTierComplete: true, nextGroupCursor: null },
      }), { status: 200 })),
    );

    await expect(requestPlatformV2Lookup({ body })).resolves.toMatchObject({ state: "ready" });
  });

  test("bounds stalled authentication before fetch begins", async () => {
    vi.useFakeTimers();
    const { supabase } = await import("@/lib/supabaseClient");
    vi.mocked(supabase.auth.getSession).mockReturnValueOnce(
      new Promise(() => undefined) as ReturnType<typeof supabase.auth.getSession>,
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = requestPlatformV2Lookup({ body, timeoutMs: 20 });
    const assertion = expect(request).rejects.toThrow("platform_request_timeout");
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("times out stalled requests and forwards caller aborts", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) =>
        new Promise((_resolve, reject) => {
          const rejectAbort = () =>
            reject(new DOMException("Aborted", "AbortError"));
          if (init?.signal?.aborted) rejectAbort();
          else init?.signal?.addEventListener("abort", rejectAbort);
        }),
      ),
    );

    const timedOut = requestPlatformV2Lookup({ body, timeoutMs: 20 });
    const timeoutAssertion = expect(timedOut).rejects.toThrow(
      "platform_request_timeout",
    );
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20);
    await timeoutAssertion;

    const controller = new AbortController();
    const aborted = requestPlatformV2Lookup({ body, signal: controller.signal });
    const abortAssertion = expect(aborted).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await abortAssertion;
  });
});
