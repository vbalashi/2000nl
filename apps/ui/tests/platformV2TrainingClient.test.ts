import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildPlatformV2TrainingActionRequest,
  clearPlatformV2TrainingClientCaches,
  consumePrefetchedPlatformV2TrainingEntry,
  fetchPlatformV2TrainingEntry,
  peekPrefetchedPlatformV2TrainingEntry,
  prefetchPlatformV2TrainingEntry,
  performPlatformV2TrainingAction,
  preloadPlatformV2Audio,
  resolvePlatformV2Audio,
  selectPlatformV2TrainingEntry,
  type PlatformV2TrainingActionCapability,
} from "@/lib/platform/platformV2TrainingClient";
import { preparePlatformV2TrainingEntry } from "@/lib/platform/platformV2TrainingPreparationClient";
import { requestPlatformV2Translation } from "@/lib/platform/platformV2TrainingMediaClient";
import type { PlatformSenseCardCapabilityV2 } from "../../../packages/shared/types/platformV2";
import {
  singleSenseEntry,
  singleSenseGroup,
} from "./platformV2TrainingFixture";
import {
  financeEntry,
  multiSenseBankGroup,
} from "./platformV2LibraryFixture";

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
  clearPlatformV2TrainingClientCaches();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("buildPlatformV2TrainingActionRequest", () => {
  test("preserves the server-owned exact entry, card type and revision for review", () => {
    const capability: PlatformSenseCardCapabilityV2 = {
      actionId: "review-card",
      elementId: "sense-card.review.success",
      messageKey: "senseCard.review.success",
      target: {
        kind: "sense-card",
        entryId: "f64f87a5-4889-4b89-b742-153b85b0c1c9",
        cardTypeId: "word-to-definition",
        stateRevision: "f6a45546-2c14-4fa5-9538-41f64c5d7d35",
      },
      reviewResult: "success",
    };

    expect(
      buildPlatformV2TrainingActionRequest(
        capability,
        "a4dc56fd-c087-47aa-85d2-a20f66ca2822",
      ),
    ).toEqual({
      actionId: "review-card",
      clientEventId: "a4dc56fd-c087-47aa-85d2-a20f66ca2822",
      target: capability.target,
      reviewResult: "success",
    });
  });

  test("preserves the active mark evidence required for undo", () => {
    const capability: PlatformSenseCardCapabilityV2 = {
      actionId: "undo-known",
      elementId: "sense-card.known.undo",
      messageKey: "senseCard.known.undo",
      target: {
        kind: "sense-card",
        entryId: "f64f87a5-4889-4b89-b742-153b85b0c1c9",
        cardTypeId: "word-to-definition",
        stateRevision: "f6a45546-2c14-4fa5-9538-41f64c5d7d35",
        activeKnownMarkId: "07b10a00-2827-4db3-b7d0-e13d940b543a",
        knownMarkRevision: "27edbe9d-5aa4-4422-bf9c-6f9342bbf114",
      },
    };

    expect(
      buildPlatformV2TrainingActionRequest(
        capability,
        "63825d8a-b62e-49ff-a360-0d5ef1ed26bf",
      ),
    ).toEqual({
      actionId: "undo-known",
      clientEventId: "63825d8a-b62e-49ff-a360-0d5ef1ed26bf",
      target: capability.target,
    });
  });
});

describe("performPlatformV2TrainingAction", () => {
  test("reuses one event identity when a committed review response disconnects", async () => {
    const capability = reviewCapability("success");
    const eventId = "a4dc56fd-c087-47aa-85d2-a20f66ca2822";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(eventId);
    const duplicateResponse = {
      contractVersion: "platform-action-v2",
      actionId: "review-card",
      clientEventId: eventId,
      accepted: true,
      card: singleSenseEntry.card,
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(duplicateResponse), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      performPlatformV2TrainingAction(capability),
    ).resolves.toEqual(duplicateResponse);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const submittedEvents = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)).clientEventId,
    );
    expect(submittedEvents).toEqual([eventId, eventId]);
  });

  test("correlates safe response timing for each action request without changing the payload", async () => {
    const capability = reviewCapability("success");
    const eventId = "7ff65846-649f-4d09-9dd7-b5dfa82d0a11";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(eventId);
    const acceptedResponse = {
      contractVersion: "platform-action-v2" as const,
      actionId: "review-card" as const,
      clientEventId: eventId,
      accepted: true,
      card: singleSenseEntry.card!,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(acceptedResponse), {
          status: 200,
          headers: {
            "x-request-id": "action-request-189",
            "server-timing":
              'action.db;dur=7.25;desc="private", route.total;dur=9.5',
          },
        }),
      ),
    );
    const dispatch = vi.spyOn(window, "dispatchEvent");

    await expect(
      performPlatformV2TrainingAction(capability, {
        transitionId: "transition-action-189",
      }),
    ).resolves.toEqual(acceptedResponse);

    expect(transitionEvents(dispatch)).toContainEqual(
      expect.objectContaining({
        transitionId: "transition-action-189",
        stage: "review.mutation.request",
        outcome: "attempt-1-http-200",
        requestId: "action-request-189",
        serverTiming: "action.db;dur=7.3, route.total;dur=9.5",
      }),
    );
    expect(JSON.stringify(transitionEvents(dispatch))).not.toContain("private");
    expect(JSON.stringify(transitionEvents(dispatch))).not.toContain("test-token");
    expect(JSON.stringify(transitionEvents(dispatch))).not.toContain(eventId);
  });

  test("correlates a timeout-before-commit retry with the same event identity", async () => {
    const capability = reviewCapability("hard");
    const eventId = "63825d8a-b62e-49ff-a360-0d5ef1ed26bf";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(eventId);
    const acceptedResponse = {
      contractVersion: "platform-action-v2",
      actionId: "review-card",
      clientEventId: eventId,
      accepted: true,
      card: singleSenseEntry.card,
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("platform_request_timeout"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptedResponse), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      performPlatformV2TrainingAction(capability),
    ).resolves.toEqual(acceptedResponse);

    expect(fetchMock.mock.calls.map(([, init]) => init?.headers)).toEqual([
      expect.objectContaining({ "x-platform-action-attempt": "1" }),
      expect.objectContaining({ "x-platform-action-attempt": "2" }),
    ]);
    expect(
      fetchMock.mock.calls.map(([, init]) =>
        JSON.parse(String(init?.body)).clientEventId,
      ),
    ).toEqual([eventId, eventId]);
  });

  test("preserves the event identity when a newer remote state rejects the retry", async () => {
    const capability = reviewCapability("easy");
    const eventId = "6b6f3a78-6e8a-4a09-a17b-833ab9591cc2";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(eventId);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "state_conflict" }), { status: 409 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      performPlatformV2TrainingAction(capability),
    ).rejects.toThrow("state_conflict");

    expect(
      fetchMock.mock.calls.map(([, init]) =>
        JSON.parse(String(init?.body)).clientEventId,
      ),
    ).toEqual([eventId, eventId]);
  });

  test("reconciles browser network TypeErrors without depending on their localized message", async () => {
    const capability = reviewCapability("fail");
    const eventId = "21b776d3-8de1-4f80-99ef-29257b629b8a";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(eventId);
    const acceptedResponse = {
      contractVersion: "platform-action-v2",
      actionId: "review-card",
      clientEventId: eventId,
      accepted: true,
      card: singleSenseEntry.card,
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptedResponse), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      performPlatformV2TrainingAction(capability),
    ).resolves.toEqual(acceptedResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("reads the authoritative receipt when both review responses disconnect", async () => {
    const capability = reviewCapability("success");
    const eventId = "f838d536-98cf-48a9-8c65-e360d025d4b8";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(eventId);
    const acceptedResponse = {
      contractVersion: "platform-action-v2" as const,
      actionId: "review-card" as const,
      clientEventId: eventId,
      accepted: true,
      card: singleSenseEntry.card!,
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockRejectedValueOnce(new Error("platform_request_timeout"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptedResponse), {
          status: 200,
          headers: {
            "x-request-id": "reconcile-request-189",
            "server-timing": "action.reconcile;dur=4, route.total;dur=6",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const dispatch = vi.spyOn(window, "dispatchEvent");

    await expect(
      performPlatformV2TrainingAction(capability, {
        transitionId: "transition-reconcile-189",
      }),
    ).resolves.toEqual(acceptedResponse);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/platform/v2/actions",
      "/api/platform/v2/actions",
      "/api/platform/v2/actions/reconcile",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      clientEventId: eventId,
    });
    expect(transitionEvents(dispatch)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "review.mutation.request",
          outcome: "attempt-1-transport-error",
        }),
        expect.objectContaining({
          stage: "review.mutation.request",
          outcome: "attempt-2-transport-error",
        }),
        expect.objectContaining({
          stage: "review.reconciliation.request",
          outcome: "reconcile-http-200",
          requestId: "reconcile-request-189",
          serverTiming: "action.reconcile;dur=4, route.total;dur=6",
        }),
      ]),
    );
  });

  test("reports a typed recoverable outcome when neither ambiguous attempt committed", async () => {
    const capability = reviewCapability("hard");
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "66fe664a-f76f-4800-a52f-af49b7dc0a3b",
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("platform_request_timeout"))
        .mockRejectedValueOnce(new TypeError("Load failed"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "action_receipt_not_found" }), {
            status: 404,
          }),
        ),
    );

    await expect(
      performPlatformV2TrainingAction(capability),
    ).rejects.toThrow("action_receipt_not_found");
  });
});

describe("requestPlatformV2Translation", () => {
  test("classifies a server-side artifact hit as cache work", async () => {
    const capability = {
      actionId: "request-translation" as const,
      elementId: "sense-card.translation.request",
      messageKey: "senseCard.translation.request",
      target: {
        kind: "entry" as const,
        entryId: singleSenseEntry.entryId,
        contentRevision: singleSenseEntry.contentRevision,
      },
      targetLanguageCode: "en",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ready" }), {
          status: 200,
          headers: { "x-platform-cache": "hit" },
        }),
      ),
    );
    const dispatch = vi.spyOn(window, "dispatchEvent");

    await requestPlatformV2Translation(capability, {
      transitionId: "transition-cache-hit",
    });

    expect(transitionStages(dispatch)).toContain("translation.cache");
    expect(transitionStages(dispatch)).not.toContain("translation.provider");
  });
});

function reviewCapability(
  reviewResult: "fail" | "hard" | "success" | "easy",
): PlatformV2TrainingActionCapability {
  const capability = singleSenseEntry.capabilities.find(
    (candidate) =>
      candidate.actionId === "review-card" &&
      candidate.reviewResult === reviewResult,
  );
  if (!capability || capability.actionId !== "review-card") {
    throw new Error(`Missing ${reviewResult} review capability fixture`);
  }
  return capability;
}

describe("Platform V2 media and translation clients", () => {
  test("resolves audio from the DTO language and requested headword", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ asset: { url: "/api/platform/audio/asset/test" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const url = await resolvePlatformV2Audio({
      cacheOwnerId: "test-user",
      capability: singleSenseGroup.header.audio!,
      text: singleSenseGroup.header.text,
    });

    expect(url).toBe("/api/platform/audio/asset/test");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/platform/v1/audio/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          text: "hand",
          languageCode: "nl",
          purpose: "dictionary-headword",
        }),
      }),
    );
  });

  test("deduplicates audio resolution while preloading and playing", async () => {
    const load = vi.fn();
    vi.stubGlobal(
      "Audio",
      class {
        preload = "";
        load = load;
      },
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ asset: { url: "/api/platform/audio/asset/test" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await preloadPlatformV2Audio({
      cacheOwnerId: "test-user",
      capability: singleSenseGroup.header.audio!,
      text: singleSenseGroup.header.text,
    });
    await expect(
      resolvePlatformV2Audio({
        cacheOwnerId: "test-user",
        capability: singleSenseGroup.header.audio!,
        text: singleSenseGroup.header.text,
      }),
    ).resolves.toBe("/api/platform/audio/asset/test");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("preparePlatformV2TrainingEntry", () => {
  const input = {
    cacheOwnerId: "test-user",
    entryId: singleSenseEntry.entryId,
    cardTypeId: "word-to-definition" as const,
    contentLanguageCode: "nl",
    translationTargetLanguageCode: "en",
    transitionId: "transition-148",
  };

  test("keeps cached translation and audio on provider-free fast paths", async () => {
    vi.stubGlobal("Audio", class { preload = ""; load() {} });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contractVersion: "platform-lookup-v2",
            query: "hand",
            request: {
              contentLanguageCode: "nl",
              translationTargetLanguageCode: "en",
              cardTypeId: "word-to-definition",
              intent: "training-review",
            },
            groups: [singleSenseGroup],
            page: { selectedTierComplete: true, nextGroupCursor: null },
          }),
          {
            status: 200,
            headers: {
              "x-request-id": "lookup-cached",
              "server-timing": "lookup.translations;dur=4.0, route.total;dur=8.0",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            asset: {
              url: "/api/platform/audio/asset/cached",
              cache: "hit",
            },
          }),
          {
            status: 200,
            headers: {
              "x-request-id": "audio-cached",
              "x-platform-cache": "hit",
            },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const dispatch = vi.spyOn(window, "dispatchEvent");

    await expect(preparePlatformV2TrainingEntry(input)).resolves.toMatchObject({
      state: "ready",
      translation: "cached",
      audio: "ready",
      entry: { entryId: singleSenseEntry.entryId },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/platform/v2/lookup",
      "/api/platform/v1/audio/resolve",
    ]);
    expect(transitionStages(dispatch)).toEqual(
      expect.arrayContaining([
        "next-card.lookup",
        "translation.cache",
        "audio.cache",
        "preparation.total",
      ]),
    );
    expect(transitionStages(dispatch)).not.toEqual(
      expect.arrayContaining(["translation.provider", "audio.provider"]),
    );
  });

  test("generates one missing translation for the selected next turn and refreshes its DTO", async () => {
    vi.stubGlobal("Audio", class { preload = ""; load() {} });
    const requestTranslation = {
      actionId: "request-translation" as const,
      elementId: "sense-card.translation.request",
      messageKey: "senseCard.translation.request",
      target: {
        kind: "entry" as const,
        entryId: singleSenseEntry.entryId,
        contentRevision: singleSenseEntry.contentRevision,
      },
      targetLanguageCode: "en",
    };
    const untranslatedEntry = {
      ...singleSenseEntry,
      translation: null,
      contentNodes: singleSenseEntry.contentNodes.map((node) => ({
        ...node,
        translations: [],
      })),
      capabilities: [...singleSenseEntry.capabilities, requestTranslation],
    };
    const payload = (entry: typeof singleSenseEntry) => ({
      contractVersion: "platform-lookup-v2",
      query: "hand",
      request: {
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "en",
        cardTypeId: "word-to-definition",
        intent: "training-review",
      },
      groups: [{ ...singleSenseGroup, entries: [entry] }],
      page: { selectedTierComplete: true, nextGroupCursor: null },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload(untranslatedEntry)), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ready" }), {
          status: 200,
          headers: { "x-platform-cache": "provider" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload(singleSenseEntry)), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ asset: { url: "/audio/hand.mp3", cache: "hit" } }),
          { status: 200, headers: { "x-platform-cache": "hit" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const dispatch = vi.spyOn(window, "dispatchEvent");

    await expect(
      preparePlatformV2TrainingEntry({
        ...input,
        generateMissingTranslation: true,
      }),
    ).resolves.toMatchObject({
      state: "ready",
      translation: "generated",
      audio: "ready",
      entry: { translation: { status: "ready" } },
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/platform/v2/lookup",
      "/api/platform/translation",
      "/api/platform/v2/lookup",
      "/api/platform/v1/audio/resolve",
    ]);
    expect(transitionStages(dispatch)).toEqual(
      expect.arrayContaining([
        "translation.provider",
        "audio.cache",
        "preparation.total",
      ]),
    );
    expect(transitionStages(dispatch)).not.toContain("translation.cache");
  });

  test("keeps the healthy next-card DTO when optional translation preparation fails", async () => {
    vi.stubGlobal("Audio", class { preload = ""; load() {} });
    const requestTranslation = {
      actionId: "request-translation" as const,
      elementId: "sense-card.translation.request",
      messageKey: "senseCard.translation.request",
      target: {
        kind: "entry" as const,
        entryId: singleSenseEntry.entryId,
        contentRevision: singleSenseEntry.contentRevision,
      },
      targetLanguageCode: "en",
    };
    const untranslatedEntry = {
      ...singleSenseEntry,
      translation: null,
      capabilities: [...singleSenseEntry.capabilities, requestTranslation],
    };
    const payload = {
      contractVersion: "platform-lookup-v2",
      query: "hand",
      request: {
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "en",
        cardTypeId: "word-to-definition",
        intent: "training-review",
      },
      groups: [{ ...singleSenseGroup, entries: [untranslatedEntry] }],
      page: { selectedTierComplete: true, nextGroupCursor: null },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "provider_unavailable" }), {
          status: 502,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ asset: { url: "/audio/hand.mp3", cache: "hit" } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      preparePlatformV2TrainingEntry({
        ...input,
        generateMissingTranslation: true,
      }),
    ).resolves.toMatchObject({
      state: "ready",
      translation: "failed",
      audio: "ready",
      entry: { entryId: singleSenseEntry.entryId, translation: null },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

});

function transitionStages(dispatch: { mock: { calls: [Event][] } }) {
  return dispatch.mock.calls.flatMap(([event]) => {
    if (!(event instanceof CustomEvent)) return [];
    if (event.type !== "2000nl:training-transition-timing") return [];
    return [event.detail.stage as string];
  });
}

function transitionEvents(dispatch: { mock: { calls: [Event][] } }) {
  return dispatch.mock.calls.flatMap(([event]) => {
    if (!(event instanceof CustomEvent)) return [];
    if (event.type !== "2000nl:training-transition-timing") return [];
    return [event.detail as Record<string, unknown>];
  });
}

describe("selectPlatformV2TrainingEntry", () => {
  test("accepts a new single-sense entry before scheduler state exists", () => {
    const entry = { ...singleSenseEntry, card: null };
    const group = { ...singleSenseGroup, entries: [entry] };

    expect(
      selectPlatformV2TrainingEntry(
        {
          contractVersion: "platform-lookup-v2",
          query: "hand",
          request: {
            contentLanguageCode: "nl",
            translationTargetLanguageCode: "en",
            cardTypeId: "word-to-definition",
            intent: "training-review",
          },
          groups: [group],
          page: { selectedTierComplete: true, nextGroupCursor: null },
        },
        entry.entryId,
      ),
    ).toEqual({ group, entry });
  });

  test("selects the exact trained meaning from a multi-sense headword group", () => {
    expect(
      selectPlatformV2TrainingEntry(
        {
          contractVersion: "platform-lookup-v2",
          query: "bank",
          request: {
            contentLanguageCode: "nl",
            translationTargetLanguageCode: "en",
            cardTypeId: "word-to-definition",
            intent: "training-review",
          },
          groups: [multiSenseBankGroup],
          page: { selectedTierComplete: true, nextGroupCursor: null },
        },
        financeEntry.entryId,
      ),
    ).toEqual({ group: multiSenseBankGroup, entry: financeEntry });
  });

  test("cannot select a pointer-only record into Training", () => {
    const pointerGroup = {
      ...singleSenseGroup,
      senseCount: 0,
      entryCount: 1,
      entries: [
        {
          kind: "cross-reference" as const,
          crossReferenceId: "entry-daar-2",
          meaningOrdinal: 2,
          label: {
            termId: "cross-reference.see",
            messageKey: "crossReference.see",
          },
          text: "daar-",
          target: { query: "daar-" },
          capabilities: [
            {
              actionId: "follow-cross-reference" as const,
              elementId: "cross-reference.follow",
              messageKey: "crossReference.follow",
            },
          ],
        },
      ],
    };

    expect(
      selectPlatformV2TrainingEntry(
        {
          contractVersion: "platform-lookup-v2",
          query: "daar",
          request: {
            contentLanguageCode: "nl",
            translationTargetLanguageCode: "en",
            cardTypeId: "word-to-definition",
            intent: "training-review",
          },
          groups: [pointerGroup],
          page: { selectedTierComplete: true, nextGroupCursor: null },
        },
        "entry-daar-2",
      ),
    ).toBeNull();
  });
});

describe("fetchPlatformV2TrainingEntry", () => {
  test("records ordinary forwarded AbortSignal cancellation", async () => {
    const controller = new AbortController();
    const dispatch = vi.spyOn(window, "dispatchEvent");
    vi.stubGlobal(
      "fetch",
      vi.fn((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
      ),
    );
    const pending = prefetchPlatformV2TrainingEntry({
      cacheOwnerId: "test-user",
      entryId: singleSenseEntry.entryId,
      cardTypeId: "word-to-definition",
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
      transitionId: "transition-forwarded-cancel",
      signal: controller.signal,
    });

    controller.abort("fixture-cancel");

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(
      transitionEvents(dispatch).filter(
        (event) =>
          event.transitionId === "transition-forwarded-cancel" &&
          event.stage === "next-card.prefetch" &&
          event.outcome === "cancelled",
      ),
    ).toHaveLength(1);
  });

  test("prefetches the exact next card and exposes it synchronously to the session", async () => {
    const payload = {
      contractVersion: "platform-lookup-v2",
      query: "hand",
      request: {
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "en",
        cardTypeId: "word-to-definition",
        intent: "training-review",
      },
      groups: [singleSenseGroup],
      page: { selectedTierComplete: true, nextGroupCursor: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      cacheOwnerId: "test-user",
      entryId: singleSenseEntry.entryId,
      cardTypeId: "word-to-definition" as const,
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
      transitionId: "transition-prefetch-189",
    };
    const dispatch = vi.spyOn(window, "dispatchEvent");

    await prefetchPlatformV2TrainingEntry(input);

    expect(peekPrefetchedPlatformV2TrainingEntry(input)).toMatchObject({
      state: "ready",
      entry: { entryId: singleSenseEntry.entryId },
    });
    await expect(consumePrefetchedPlatformV2TrainingEntry(input)).resolves.toMatchObject({
      state: "ready",
      entry: { entryId: singleSenseEntry.entryId },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(transitionEvents(dispatch)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transitionId: "transition-prefetch-189",
          stage: "next-card.prefetch",
          outcome: "miss",
        }),
        expect.objectContaining({
          transitionId: "transition-prefetch-189",
          stage: "next-card.prefetch",
          outcome: "accepted-hit-ready",
        }),
      ]),
    );
  });

  test("partitions prefetched lookup state by browser cache owner", async () => {
    const payload = {
      contractVersion: "platform-lookup-v2",
      query: "hand",
      request: {
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "en",
        cardTypeId: "word-to-definition",
        intent: "training-review",
      },
      groups: [singleSenseGroup],
      page: { selectedTierComplete: true, nextGroupCursor: null },
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      cacheOwnerId: "user-a",
      entryId: singleSenseEntry.entryId,
      cardTypeId: "word-to-definition" as const,
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
    };

    await prefetchPlatformV2TrainingEntry(input);
    await prefetchPlatformV2TrainingEntry({
      ...input,
      cacheOwnerId: "user-b",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("aborts a stalled lookup instead of leaving the card loading forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      ),
    );
    const lookup = prefetchPlatformV2TrainingEntry({
      cacheOwnerId: "test-user",
      entryId: "stalled-entry",
      cardTypeId: "word-to-definition",
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
    });
    const rejection = expect(lookup).rejects.toThrow("platform_request_timeout");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(12_000);

    await rejection;
  });

  test("forwards caller cancellation to an in-flight prefetch", async () => {
    const fetchMock = vi.fn((_url, init) =>
      new Promise((_resolve, reject) => {
        const rejectAbort = () => {
          reject(new DOMException("Aborted", "AbortError"));
        };
        if (init?.signal?.aborted) rejectAbort();
        else init?.signal?.addEventListener("abort", rejectAbort);
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const lookup = prefetchPlatformV2TrainingEntry({
      cacheOwnerId: "test-user",
      entryId: "cancelled-entry",
      cardTypeId: "word-to-definition",
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
      signal: controller.signal,
    });
    const rejection = expect(lookup).rejects.toMatchObject({
      name: "AbortError",
    });

    controller.abort();

    await rejection;
    if (fetchMock.mock.calls.length) {
      expect(fetchMock.mock.calls[0]?.[1]?.signal).toHaveProperty(
        "aborted",
        true,
      );
    }
  });

  test("sends the scheduler entry id and preserves an HTTP lookup failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "lookup_failed" }), {
        status: 500,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchPlatformV2TrainingEntry({
      entryId: singleSenseEntry.entryId,
      cardTypeId: "word-to-definition",
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
    });

    await expect(request).resolves.toMatchObject({
      state: "lookup-http-error",
      status: 500,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/platform/v2/lookup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          entryId: singleSenseEntry.entryId,
          cardTypeId: "word-to-definition",
          contentLanguageCode: "nl",
          translationTargetLanguageCode: "en",
          intent: "training-review",
        }),
      }),
    );
  });

  test("classifies an incompatible response contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ contractVersion: "unexpected" }), {
          status: 200,
        }),
      ),
    );

    await expect(
      fetchPlatformV2TrainingEntry({
        entryId: singleSenseEntry.entryId,
        cardTypeId: "word-to-definition",
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "en",
      }),
    ).resolves.toEqual({ state: "contract-mismatch" });
  });

  test("classifies a valid response that excludes the scheduler entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            contractVersion: "platform-lookup-v2",
            query: "hand",
            request: {
              contentLanguageCode: "nl",
              translationTargetLanguageCode: "en",
              cardTypeId: "word-to-definition",
              intent: "training-review",
            },
            groups: [],
            page: { selectedTierComplete: true, nextGroupCursor: null },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchPlatformV2TrainingEntry({
        entryId: singleSenseEntry.entryId,
        cardTypeId: "word-to-definition",
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "en",
      }),
    ).resolves.toEqual({ state: "entry-not-found" });
  });
});
