import { expect, test } from "@playwright/test";
import {
  buildFakeSupabaseSession,
  installSupabaseSession,
} from "../utils/supabaseTestSession";

const entries = [
  {
    id: "word-1",
    headword: "huis",
    part_of_speech: "substantief",
    gender: "het",
    raw: {
      meanings: [
        {
          definition: "Een gebouw waar mensen wonen.",
          example: "Het huis aan de gracht is oud.",
          links: [{ label: "gracht", headword: "gracht" }],
        },
      ],
    },
  },
  {
    id: "word-2",
    headword: "gracht",
    part_of_speech: "substantief",
    gender: "de",
    raw: {
      meanings: [
        {
          definition: "Een waterloop in de stad.",
          example: "De gracht stroomt langs het huis.",
          links: [],
        },
      ],
    },
  },
];

const wordListItems = entries.map((entry, index) => ({
  rank: index + 1,
  word_id: entry.id,
  word_entries: entry,
}));

let nextWordIndex = 0;

const userSession = {
  id: "user-1",
  email: "tester@example.com",
};

const restHandler = async (route: any) => {
  const request = route.request();
  const method = request.method().toUpperCase();

  if (method === "OPTIONS") {
    await route.fulfill({ status: 204, body: "" });
    return;
  }

  const url = new URL(request.url());
  const pathname = url.pathname;

  // ---------------------------------------------------------------------------
  // RPCs used by TrainingScreen
  // ---------------------------------------------------------------------------

  if (pathname.endsWith("/rpc/get_next_card")) {
    const body = request.postDataJSON?.() ?? {};
    const excludedIds = new Set<string>(
      Array.isArray(body.p_exclude_entry_ids) ? body.p_exclude_entry_ids : [],
    );
    const excludedCardKeys = new Set<string>(
      Array.isArray(body.p_exclude_card_keys) ? body.p_exclude_card_keys : [],
    );
    const orderedEntries = [
      ...entries.slice(nextWordIndex),
      ...entries.slice(0, nextWordIndex),
    ];
    const pick =
      orderedEntries.find(
        (entry) =>
          !excludedIds.has(entry.id) &&
          !excludedCardKeys.has(`${entry.id}:word-to-definition`),
      ) ??
      entries[Math.min(nextWordIndex, entries.length - 1)];
    const pickIndex = entries.findIndex((entry) => entry.id === pick.id);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        {
          ...pick,
          mode: "word-to-definition",
          is_nt2_2000: false,
          meanings_count: pick.raw?.meanings?.length ?? 1,
          stats: {
            source: pickIndex === 0 ? "new" : "review",
            mode: "word-to-definition",
            interval: null,
            stability: null,
            new_today: 0,
            daily_new_limit: 10,
            new_pool_size: 0,
            learning_due_count: 0,
            review_pool_size: 0,
            next_review: null,
          },
        },
      ]),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_learning_preferences")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        training_mode: "word-to-definition",
        modes_enabled: ["word-to-definition"],
        card_filter: "both",
        language_code: "nl",
        new_review_ratio: 2,
        active_scenario: "understanding",
      }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_training_scenarios")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        {
          id: "understanding",
          name_en: "Understanding",
          name_nl: "Begrip",
          card_modes: ["word-to-definition"],
          graduation_threshold: 21,
          enabled: true,
          sort_order: 1,
        },
      ]),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_scenario_stats")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        learned: 0,
        in_progress: 0,
        new: entries.length,
        total: entries.length,
        scenario_id: "understanding",
        card_modes: ["word-to-definition"],
        graduation_threshold: 21,
      }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_available_word_lists")) {
    const body = request.postDataJSON?.() ?? {};
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        body.p_list_type === "user"
          ? []
          : [
              {
                id: "list-1",
                slug: "nt2-2000",
                name: "VanDale 2k",
                language_code: "nl",
                primary_language_code: "nl",
                is_primary: true,
                word_list_items: [{ count: entries.length }],
              },
            ],
      ),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_active_word_list")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        active_list_id: "list-1",
        active_list_type: "curated",
      }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_word_list_summary")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "list-1",
        slug: "nt2-2000",
        name: "VanDale 2k",
        language_code: "nl",
        primary_language_code: "nl",
        is_primary: true,
        word_list_items: [{ count: entries.length }],
      }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_detailed_training_stats")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        newWordsToday: 0,
        newCardsToday: 0,
        dailyNewLimit: 10,
        reviewWordsDone: 0,
        reviewCardsDone: 0,
        reviewWordsDue: 0,
        reviewCardsDue: 0,
        totalWordsLearned: 0,
        totalWordsInList: 2000,
      }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/handle_card_review")) {
    // Advance to the next word after a "review".
    nextWordIndex = Math.min(nextWordIndex + 1, entries.length - 1);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_user_card_state")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        click_count: 0,
        last_seen_at: null,
        last_reviewed_at: new Date().toISOString(),
        next_review_at: null,
        hidden: false,
        frozen_until: null,
        fsrs_stability: 1,
        fsrs_difficulty: 5,
        fsrs_reps: 1,
        fsrs_lapses: 0,
        fsrs_last_grade: 1,
        fsrs_last_interval: 0,
        in_learning: true,
        learning_due_at: null,
      }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/record_card_view")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/handle_click")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    return;
  }

  if (pathname.endsWith("/rpc/fetch_dictionary_entry_gated")) {
    const body = request.postDataJSON?.() ?? {};
    const entry = entries.find((item) => item.headword === body.p_headword);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry ? [{ ...entry, meanings_count: 1 }] : []),
    });
    return;
  }

  if (pathname.endsWith("/rpc/get_last_review_debug")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(null),
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Tables used by TrainingScreen + dictionary lookup
  // ---------------------------------------------------------------------------

  if (pathname.endsWith("/user_settings")) {
    if (method === "GET" || method === "HEAD") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme_preference: "system",
          modes_enabled: ["word-to-definition"],
          card_filter: "both",
          language_code: "nl",
          new_review_ratio: 2,
          active_scenario: "understanding",
          translation_lang: "off",
          training_sidebar_pinned: false,
          preferences: {},
        }),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
    return;
  }

  if (pathname.endsWith("/word_lists")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ id: "list-1", slug: "nt2-2000", name: "VanDale 2k", language_code: "nl" }]),
    });
    return;
  }

  if (pathname.endsWith("/word_list_items")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(wordListItems),
    });
    return;
  }

  if (pathname.endsWith("/user_word_status")) {
    if (request.method().toUpperCase() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
    return;
  }

  if (pathname.endsWith("/user_events")) {
    if (request.method().toUpperCase() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
    return;
  }

  if (pathname.endsWith("/word_entries")) {
    const headwordParam = url.searchParams.get("headword");
    const target = headwordParam?.startsWith("eq.")
      ? headwordParam.replace("eq.", "")
      : headwordParam;
    const entry = entries.find((item) => item.headword === target);

    if (method === "HEAD") {
      await route.fulfill({
        status: 200,
        headers: {
          // Supabase uses Prefer: count=exact and returns `content-range` for HEAD.
          "content-range": `0-${entry ? 0 : -1}/${entry ? 1 : 0}`,
        },
        body: "",
      });
      return;
    }

    await route.fulfill({
      status: entry ? 200 : 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry ? [entry] : []),
    });
    return;
  }

  await route.fulfill({
    status: 404,
    body: JSON.stringify({ error: "Not mocked" }),
  });
};

test("training flow persists review and dictionary lookup", async ({
  page,
}) => {
  nextWordIndex = 0;

  await page.route("**/auth/v1/user**", async (route) => {
    const method = route.request().method().toUpperCase();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: userSession.id, email: userSession.email }),
    });
  });

  await page.route("**/rest/v1/**", restHandler);

  // Bypass OTP auth flow for browser automation by installing a fake Supabase session.
  // The app only reads the session via supabase.auth.getSession() (localStorage), so no network is needed.
  await installSupabaseSession(page, buildFakeSupabaseSession(userSession));

  await page.goto("/");

  await expect(page.locator("h1")).toHaveText(/huis/i);

  // Reveal definition so the linked word appears as a clickable button.
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /^gracht$/i }).click();

  // Clicking a linked word should open the Details tab for that entry.
  const drawer = page.locator("div.fixed.inset-0.z-40");
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Bekijk details" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: /gracht/i })
  ).toBeVisible();
  await page.getByRole("button", { name: "Sluiten" }).click();
  await expect(drawer).toBeHidden();

  // Grade the card to advance to the next word.
  await page.getByRole("button", { name: "Begin met leren" }).click();
  await expect(page.locator("h1")).toHaveText(/gracht/i);
});
