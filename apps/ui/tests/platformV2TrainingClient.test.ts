import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildPlatformV2TrainingActionRequest,
  consumePrefetchedPlatformV2TrainingEntry,
  fetchPlatformV2TrainingEntry,
  peekPrefetchedPlatformV2TrainingEntry,
  prefetchPlatformV2TrainingEntry,
  preloadPlatformV2Audio,
  resolvePlatformV2Audio,
  selectPlatformV2TrainingEntry,
} from "@/lib/platform/platformV2TrainingClient";
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
  vi.unstubAllGlobals();
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
      capability: singleSenseGroup.header.audio!,
      text: singleSenseGroup.header.text,
    });
    await expect(
      resolvePlatformV2Audio({
        capability: singleSenseGroup.header.audio!,
        text: singleSenseGroup.header.text,
      }),
    ).resolves.toBe("/api/platform/audio/asset/test");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

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
});

describe("fetchPlatformV2TrainingEntry", () => {
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
      entryId: singleSenseEntry.entryId,
      cardTypeId: "word-to-definition" as const,
      contentLanguageCode: "nl",
      translationTargetLanguageCode: "en",
    };

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
