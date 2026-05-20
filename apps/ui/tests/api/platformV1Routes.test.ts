import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const from = vi.fn();
const getUser = vi.fn();
const createClient = vi.fn(() => ({
  auth: { getUser },
  rpc,
  from,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

const request = (path: string, body: unknown, token = "token-1") =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      origin: "https://client.example",
    },
    body: JSON.stringify(body),
  });

function mockAuthenticatedUser() {
  getUser.mockResolvedValueOnce({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

describe("/api/platform/v1 contract", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "https://client.example";
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
  });

  test("lookup response shape is snapshotted", async () => {
    const { POST } = await import("@/app/api/platform/v1/lookup/route");
    mockAuthenticatedUser();
    rpc.mockImplementation((name: string) => {
      if (name === "fetch_dictionary_entry_gated") {
        return Promise.resolve({
          data: [
            {
              id: "entry-1",
              dictionary_id: "dict-1",
              language_code: "nl",
              headword: "huis",
              meaning_id: 1,
              part_of_speech: "zn",
              gender: "het",
              raw: { meanings: [{ definition: "gebouw" }] },
              is_nt2_2000: true,
              meanings_count: 1,
              dictionary: {
                id: "dict-1",
                language_code: "nl",
                slug: "nl-vandale",
                name: "VanDale Dutch",
                kind: "curated",
                visibility: "system",
                owner_user_id: null,
                is_editable: false,
                schema_key: "nl-vandale-v1",
                schema_version: 1,
              },
            },
          ],
          error: null,
        });
      }
      if (name === "get_user_list_memberships_for_entries") {
        return Promise.resolve({
          data: [
            {
              entry_id: "entry-1",
              lists: [
                {
                  id: "list-1",
                  kind: "user",
                  name: "My words",
                  description: "Personal list",
                  primary_language_code: "nl",
                  default_scenario_id: "understanding",
                  card_policy: "prefer",
                  card_type_ids: ["word-to-definition"],
                  item_count: 7,
                },
              ],
            },
          ],
          error: null,
        });
      }
      if (name === "get_user_card_states_for_entries") {
        return Promise.resolve({
          data: [
            {
              entry_id: "entry-1",
              card_type_id: "word-to-definition",
              click_count: 2,
              seen_count: 4,
              success_count: 1,
              last_seen_at: "2026-05-17T10:00:00.000Z",
              last_reviewed_at: "2026-05-17T11:00:00.000Z",
              next_review_at: "2026-05-18T11:00:00.000Z",
              hidden: false,
              frozen_until: null,
              in_learning: false,
              learning_due_at: null,
              fsrs_stability: 3.5,
              fsrs_difficulty: 5.2,
              fsrs_reps: 1,
              fsrs_lapses: 0,
              fsrs_last_grade: 3,
              fsrs_last_interval: 1,
              fsrs_params_version: "fsrs-6-default",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      request("/api/platform/v1/lookup", {
        query: "huis",
        includeUserState: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchInlineSnapshot(`
      {
        "items": [
          {
            "availableActions": [
              "record-view",
              "start-learning",
              "mark-known",
              "mark-unknown",
              "review-card",
              "add-to-list",
              "remove-from-list",
              "copy-to-user-dictionary",
              "create-user-entry",
            ],
            "dictionary": {
              "id": "dict-1",
              "isEditable": false,
              "kind": "curated",
              "languageCode": "nl",
              "name": "VanDale Dutch",
              "schemaKey": "nl-vandale-v1",
              "schemaVersion": 1,
              "slug": "nl-vandale",
              "visibility": "system",
            },
            "entry": {
              "dictionaryId": "dict-1",
              "gender": "het",
              "headword": "huis",
              "id": "entry-1",
              "isNt22000": true,
              "languageCode": "nl",
              "meaningId": 1,
              "meaningsCount": 1,
              "partOfSpeech": "zn",
              "raw": {
                "meanings": [
                  {
                    "definition": "gebouw",
                  },
                ],
              },
            },
            "listMemberships": [
              {
                "cardPolicy": "prefer",
                "cardTypeIds": [
                  "word-to-definition",
                ],
                "defaultScenarioId": "understanding",
                "description": "Personal list",
                "id": "list-1",
                "itemCount": 7,
                "kind": "user",
                "name": "My words",
                "primaryLanguageCode": "nl",
              },
            ],
            "progressSummary": {
              "hiddenCardCount": 0,
              "lastReviewedAt": "2026-05-17T11:00:00.000Z",
              "learningCardCount": 0,
              "nextReviewAt": "2026-05-18T11:00:00.000Z",
              "reviewedCardCount": 1,
              "status": "reviewing",
              "strongestCardTypeId": "word-to-definition",
              "trackedCardCount": 1,
              "weakestCardTypeId": "word-to-definition",
            },
            "userStateByCardType": {
              "word-to-definition": {
                "cardTypeId": "word-to-definition",
                "clickCount": 2,
                "entryId": "entry-1",
                "frozenUntil": null,
                "fsrs": {
                  "difficulty": 5.2,
                  "lapses": 0,
                  "lastGrade": 3,
                  "lastInterval": 1,
                  "paramsVersion": "fsrs-6-default",
                  "reps": 1,
                  "stability": 3.5,
                },
                "hidden": false,
                "inLearning": false,
                "lastReviewedAt": "2026-05-17T11:00:00.000Z",
                "lastSeenAt": "2026-05-17T10:00:00.000Z",
                "learningDueAt": null,
                "nextReviewAt": "2026-05-18T11:00:00.000Z",
                "seenCount": 4,
                "successCount": 1,
              },
            },
          },
        ],
        "query": "huis",
      }
    `);
  });

  test("actions response shape is snapshotted", async () => {
    const { POST } = await import("@/app/api/platform/v1/actions/route");
    mockAuthenticatedUser();
    rpc
      .mockResolvedValueOnce({
        data: { id: "entry-1", dictionary_id: "dict-1" },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request("/api/platform/v1/actions", {
        action: "review-card",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        result: "success",
        turnId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchInlineSnapshot(`
      {
        "action": "review-card",
        "cardTypeId": "word-to-definition",
        "entryId": "entry-1",
        "ok": true,
        "result": "success",
        "turnId": "8b9df84e-7956-4712-a39a-3ea8363be1cf",
      }
    `);
  });

  test("analyze-selection response shape is snapshotted and read-only", async () => {
    const { POST } = await import("@/app/api/platform/v1/analyze-selection/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request("/api/platform/v1/analyze-selection", {
        selection: "huis",
        includeUserState: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    await expect(response.json()).resolves.toMatchInlineSnapshot(`
      {
        "actionResults": [],
        "lookup": {
          "items": [],
          "query": "huis",
        },
      }
    `);
  });
});
