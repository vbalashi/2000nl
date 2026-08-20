import type { Page, Route } from "@playwright/test";
import {
  buildFakeSupabaseSession,
  installSupabaseSession,
} from "../utils/supabaseTestSession";

export const TRAINING_ATTRIBUTION_THRESHOLD_MS = 1_000;
export const TRAINING_ATTRIBUTION_TRANSITIONS = 20;

export type TrainingTimingEvent = {
  transitionId: string;
  stage: string;
  durationMs: number;
  outcome: string;
  recordedAtMs: number;
  observedAtMs: number;
  monotonicStartedAtMs: number;
  monotonicEndedAtMs: number;
  requestId?: string;
  serverTiming?: string;
};

type VisibleStateObservation = {
  atMs: number;
  kind: "loading-state" | "ready-control";
  text: string;
};

export type TrainingAttributionCapture = {
  timings: TrainingTimingEvent[];
  visibleStates: VisibleStateObservation[];
};

export type TrainingAttributionCategory =
  | "auth"
  | "hydration"
  | "selection/scheduler"
  | "lookup"
  | "translation/audio preparation"
  | "mutation"
  | "network"
  | "render"
  | "end-to-end";

export type TrainingAttributionProfileReport = {
  profile: { name: string; width: number; height: number };
  acceptedTransitions: number;
  actionPaths: { learn: number; review: number };
  acceptedTransitionSummary: DurationSummary;
  initialContinue: {
    transitionId: string;
    durationMs: number;
    visibleStates: VisibleStateObservation[];
  } | null;
  prefetchByTransition: Array<{
    transitionId: string;
    outcomes: string[];
  }>;
  prefetchLifecycleCoverage: Record<"hit" | "miss" | "cancel" | "fallback", boolean>;
  timingEventCount: number;
  transitionIds: string[];
  requestIds: string[];
  visibleStates: VisibleStateObservation[];
  requiredSurfaces: Record<string, boolean>;
  missingRequiredSurfaces: string[];
  summary: Record<string, DurationSummary>;
  overThreshold: Array<
    TrainingTimingEvent & {
      category: TrainingAttributionCategory;
      componentStages: string[];
      causalAttribution: {
        rule: string;
        causalCategories: TrainingAttributionCategory[];
        observedCategoryDurations: Partial<Record<TrainingAttributionCategory, number>>;
        criticalPath: Array<{
          category: TrainingAttributionCategory;
          stage: string;
          durationMs: number;
          monotonicStartedAtMs: number;
          monotonicEndedAtMs: number;
        }>;
        criticalPathDurationMs: number;
        residualMs: number;
      } | null;
    }
  >;
  unclassifiedOverThreshold: TrainingTimingEvent[];
};

type DurationSummary = {
  count: number;
  p50: number;
  p95: number;
  max: number;
};

type FixtureEntry = {
  id: string;
  headword: string;
  part_of_speech: string;
  gender: string;
  raw: { meanings: Array<{ definition: string; example: string; links: [] }> };
};

const entries: FixtureEntry[] = Array.from({ length: 64 }, (_, index) => ({
  id: `attribution-word-${index + 1}`,
  headword: index === 0 ? "huis" : `woord${index + 1}`,
  part_of_speech: "substantief",
  gender: index === 0 ? "het" : "de",
  raw: {
    meanings: [
      {
        definition: `Deterministische definitie ${index + 1}.`,
        example: `Dit is voorbeeldzin ${index + 1}.`,
        links: [],
      },
    ],
  },
}));

const userSession = {
  id: "training-attribution-user",
  email: "training-attribution@example.invalid",
};

export async function setupAuthenticatedTrainingAttributionPage(
  page: Page,
  injectedDelayMs: number,
) {
  let nextEntryIndex = 0;
  let actionCount = 0;
  let requestSequence = 0;
  let delayNextFallback = false;
  let lifecycleScenariosEnabled = false;
  let backgroundScenarioIndex = 0;
  let expectOnDemandSelection = false;
  let acceptedScenario: "hit" | "miss" | "fallback" = "hit";
  let slowEligibleCount = 0;
  const failFirstLookupForEntries = new Set<string>();
  const lookupAttempts = new Map<string, number>();
  const splitDelayMs = injectedDelayMs > 0 ? Math.ceil(injectedDelayMs * 0.55) : 0;

  const correlatedHeaders = (surface: string) => {
    requestSequence += 1;
    return {
      "content-type": "application/json",
      "x-request-id": `attribution-${surface}-${requestSequence}`,
      "server-timing": "route.total;dur=5, fixture.db;dur=2",
    };
  };
  const fulfillJson = (
    route: Route,
    body: unknown,
    surface = "rest",
    status = 200,
  ) =>
    route.fulfill({
      status,
      headers: correlatedHeaders(surface),
      body: JSON.stringify(body),
    });

  await page.route("**/auth/v1/user**", async (route) => {
    if (route.request().method().toUpperCase() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await fulfillJson(route, userSession, "auth");
  });

  await page.route("**/api/platform/v2/lookup", async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    const entryId = typeof body.entryId === "string" ? body.entryId : "";
    const entry = entries.find((candidate) => candidate.id === entryId);
    const attempt = (lookupAttempts.get(entryId) ?? 0) + 1;
    lookupAttempts.set(entryId, attempt);
    if (failFirstLookupForEntries.has(entryId) && attempt === 1) {
      await fulfillJson(
        route,
        { contractVersion: "fixture-contract-mismatch" },
        "lookup-fallback",
      );
      return;
    }
    await fulfillJson(
      route,
      {
        contractVersion: "platform-lookup-v2",
        query:
          typeof body.query === "string"
            ? body.query
            : (entry?.headword ?? entryId),
        request: {
          contentLanguageCode: body.contentLanguageCode ?? "nl",
          translationTargetLanguageCode:
            body.translationTargetLanguageCode ?? "ru",
          cardTypeId: body.cardTypeId ?? "word-to-definition",
          intent: "training-review",
        },
        groups: entry
          ? [buildLookupGroup(entry, entries.indexOf(entry) < 3)]
          : [],
        page: { selectedTierComplete: true, nextGroupCursor: null },
      },
      "lookup",
    );
  });

  await page.route("**/api/platform/v2/actions", async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    actionCount += 1;
    if (acceptedScenario !== "hit") slowEligibleCount += 1;
    const injectThisTransition =
      splitDelayMs > 0 &&
      acceptedScenario !== "hit" &&
      slowEligibleCount % 4 === 0;
    if (injectThisTransition) {
      await wait(splitDelayMs);
      delayNextFallback = true;
    }
    await fulfillJson(
      route,
      {
        contractVersion: "platform-action-v2",
        actionId: body.actionId,
        clientEventId: body.clientEventId,
        accepted: true,
        card: {
          cardTypeId: "word-to-definition",
          scheduler: { phase: "learning", repeatCount: 3 },
          knownMark: null,
          stateRevision: `accepted-${actionCount}`,
        },
      },
      "action",
    );
  });

  await page.route("**/api/platform/v1/audio/resolve", async (route) => {
    await fulfillJson(
      route,
      { asset: { url: "data:audio/mpeg;base64,SUQz" } },
      "audio",
    );
  });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    const url = new URL(request.url());
    const pathname = url.pathname;
    const body = request.postDataJSON?.() ?? {};

    if (pathname.endsWith("/rpc/get_next_card")) {
      const excludedCardKeys = Array.isArray(body.p_exclude_card_keys)
        ? body.p_exclude_card_keys
        : [];
      if (lifecycleScenariosEnabled && excludedCardKeys.length > 0) {
        if (expectOnDemandSelection) {
          expectOnDemandSelection = false;
          if (delayNextFallback) {
            delayNextFallback = false;
            await wait(splitDelayMs);
          }
          nextEntryIndex = Math.min(nextEntryIndex + 1, entries.length - 1);
          await fulfillJson(
            route,
            [buildSchedulerEntry(entries[nextEntryIndex]!)],
            "scheduler-fallback",
          );
          return;
        }
        backgroundScenarioIndex += 1;
        const scenario = (["hit", "miss", "fallback"] as const)[
          (backgroundScenarioIndex - 1) % 3
        ]!;
        acceptedScenario = scenario;
        if (scenario === "miss") {
          expectOnDemandSelection = true;
          await fulfillJson(route, [], "scheduler-prefetch-miss");
          return;
        }
        nextEntryIndex = Math.min(nextEntryIndex + 1, entries.length - 1);
        if (scenario === "fallback") {
          failFirstLookupForEntries.add(entries[nextEntryIndex]!.id);
          expectOnDemandSelection = true;
        }
      } else if (excludedCardKeys.length > 0) {
        acceptedScenario = "hit";
        if (delayNextFallback) {
          delayNextFallback = false;
          await wait(splitDelayMs);
        }
        nextEntryIndex = Math.min(nextEntryIndex + 1, entries.length - 1);
      }
      await fulfillJson(route, [buildSchedulerEntry(entries[nextEntryIndex]!)], "scheduler");
      return;
    }

    if (pathname.endsWith("/rpc/get_learning_preferences")) {
      await fulfillJson(route, learningPreferences(), "preferences");
      return;
    }
    if (pathname.endsWith("/rpc/get_training_scenarios")) {
      await fulfillJson(
        route,
        [
          {
            id: "understanding",
            name_en: "Understanding",
            name_nl: "Begrip",
            card_modes: ["word-to-definition"],
            graduation_threshold: 21,
            enabled: true,
            sort_order: 1,
          },
        ],
        "scenarios",
      );
      return;
    }
    if (pathname.endsWith("/rpc/get_scenario_stats")) {
      await fulfillJson(
        route,
        {
          learned: 0,
          in_progress: 1,
          new: entries.length - 1,
          total: entries.length,
          scenario_id: "understanding",
          card_modes: ["word-to-definition"],
          graduation_threshold: 21,
        },
        "scenario-stats",
      );
      return;
    }
    if (pathname.endsWith("/rpc/get_available_word_lists")) {
      await fulfillJson(
        route,
        body.p_list_type === "user" ? [] : [wordListSummary()],
        "lists",
      );
      return;
    }
    if (pathname.endsWith("/rpc/get_available_learning_languages")) {
      await fulfillJson(
        route,
        [
          {
            code: "nl",
            label: "Nederlands",
            dictionary_count: 1,
            curated_list_count: 1,
            user_list_count: 0,
            has_training_eligible_lists: true,
          },
        ],
        "languages",
      );
      return;
    }
    if (pathname.endsWith("/rpc/get_available_dictionary_sources")) {
      await fulfillJson(route, [], "dictionary-sources");
      return;
    }
    if (pathname.endsWith("/rpc/get_training_filter_sources")) {
      await fulfillJson(route, [], "filter-sources");
      return;
    }
    if (pathname.endsWith("/rpc/get_active_training_scope")) {
      await fulfillJson(
        route,
        {
          language_code: "nl",
          active_list_id: "list-attribution",
          active_list_type: "curated",
          active_scenario: "understanding",
          card_filter: "both",
          modes_enabled: ["word-to-definition"],
          new_review_ratio: 2,
          has_saved_scope: true,
          is_valid: true,
        },
        "active-scope",
      );
      return;
    }
    if (pathname.endsWith("/rpc/update_active_training_scope")) {
      await fulfillJson(
        route,
        {
          language_code: "nl",
          active_list_id: body.p_list_id ?? "list-attribution",
          active_list_type: body.p_list_type ?? "curated",
          active_scenario: body.p_active_scenario ?? "understanding",
          card_filter: body.p_card_filter ?? "both",
          modes_enabled: body.p_modes_enabled ?? ["word-to-definition"],
          new_review_ratio: body.p_new_review_ratio ?? 2,
          has_saved_scope: true,
          is_valid: true,
        },
        "update-scope",
      );
      return;
    }
    if (pathname.endsWith("/rpc/get_active_word_list")) {
      await fulfillJson(
        route,
        { active_list_id: "list-attribution", active_list_type: "curated" },
        "active-list",
      );
      return;
    }
    if (pathname.endsWith("/rpc/get_word_list_summary")) {
      await fulfillJson(route, wordListSummary(), "list-summary");
      return;
    }
    if (pathname.endsWith("/rpc/get_detailed_training_stats")) {
      await fulfillJson(
        route,
        {
          newWordsToday: 0,
          newCardsToday: 0,
          dailyNewLimit: 30,
          reviewWordsDone: 0,
          reviewCardsDone: 0,
          reviewWordsDue: 20,
          reviewCardsDue: 20,
          totalWordsLearned: 0,
          totalWordsInList: entries.length,
        },
        "stats",
      );
      return;
    }
    if (pathname.endsWith("/rpc/get_user_card_state")) {
      await fulfillJson(
        route,
        {
          click_count: 0,
          last_seen_at: null,
          last_reviewed_at: new Date(0).toISOString(),
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
        },
        "card-state",
      );
      return;
    }
    if (
      pathname.endsWith("/rpc/record_card_view") ||
      pathname.endsWith("/rpc/handle_card_review")
    ) {
      await fulfillJson(route, { ok: true }, "legacy-action");
      return;
    }
    if (pathname.endsWith("/user_settings")) {
      await fulfillJson(
        route,
        method === "GET" || method === "HEAD"
          ? { ...learningPreferences(), theme_preference: "system", translation_lang: "ru", preferences: {} }
          : [],
        "settings",
        method === "GET" || method === "HEAD" ? 200 : 201,
      );
      return;
    }
    if (pathname.endsWith("/word_lists")) {
      await fulfillJson(route, [wordListSummary()], "word-lists");
      return;
    }
    if (pathname.endsWith("/word_list_items")) {
      await fulfillJson(
        route,
        entries.map((entry, index) => ({ rank: index + 1, word_id: entry.id, word_entries: entry })),
        "word-list-items",
      );
      return;
    }
    if (pathname.endsWith("/user_word_status") || pathname.endsWith("/user_events")) {
      await fulfillJson(route, [], "user-state", method === "GET" ? 200 : 201);
      return;
    }
    await fulfillJson(route, { error: "Not mocked by attribution harness" }, "missing", 404);
  });

  await installSupabaseSession(page, buildFakeSupabaseSession(userSession));
  await page.goto("/");
  return {
    beginMeasuredTransitions() {
      lifecycleScenariosEnabled = true;
    },
  };
}

export async function installTrainingAttributionCollector(page: Page) {
  await page.addInitScript(() => {
    const capture = {
      timings: [] as TrainingTimingEvent[],
      visibleStates: [] as VisibleStateObservation[],
    };
    const pushBounded = <T,>(items: T[], item: T, max: number) => {
      items.push(item);
      if (items.length > max) items.splice(0, items.length - max);
    };
    const safeText = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 120);
    const lastVisibleStateByKind = new Map<string, string>();
    const sampleVisibleState = () => {
      const visible = (element: Element) => {
        const style = window.getComputedStyle(element as HTMLElement);
        return style.display !== "none" && style.visibility !== "hidden";
      };
      const loadingTexts = Array.from(
        document.querySelectorAll('p, [role="status"], [data-testid="training-v2-loading"]'),
      )
        .filter(visible)
        .map((element) => safeText(element.textContent ?? ""))
        .filter((text) => /laden|loading|woorden laden|загрузка/i.test(text));
      const readyTexts = Array.from(document.querySelectorAll("button"))
        .filter((element) => visible(element) && !(element as HTMLButtonElement).disabled)
        .map((element) => safeText(element.textContent ?? ""))
        .filter((text) =>
          /Antwoord Tonen|Показать ответ|Begin met leren|Учить|Goed|Хорошо|Moeilijk|Трудно|Makkelijk|Легко|Opnieuw|Снова/.test(
            text,
          ),
        );
      for (const [kind, texts] of [
        ["loading-state", loadingTexts],
        ["ready-control", readyTexts],
      ] as const) {
        const text = texts.join(" | ");
        if (lastVisibleStateByKind.get(kind) === text) continue;
        lastVisibleStateByKind.set(kind, text);
        pushBounded(
          capture.visibleStates,
          { atMs: Number(performance.now().toFixed(1)), kind, text: text || "(hidden)" },
          4_096,
        );
      }
    };
    window.addEventListener("2000nl:training-transition-timing", (event) => {
      const detail = (event as CustomEvent<Omit<TrainingTimingEvent, "observedAtMs">>).detail;
      pushBounded(
        capture.timings,
        { ...detail, observedAtMs: Number(performance.now().toFixed(1)) },
        2_048,
      );
    });
    const observer = new MutationObserver(sampleVisibleState);
    observer.observe(document, { attributes: true, childList: true, subtree: true });
    window.addEventListener("DOMContentLoaded", sampleVisibleState);
    const sampler = window.setInterval(sampleVisibleState, 5);
    window.setTimeout(() => window.clearInterval(sampler), 2_000);
    Object.defineProperty(window, "__trainingAttributionCapture", {
      value: capture,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
}

export async function readTrainingAttributionCapture(
  page: Page,
): Promise<TrainingAttributionCapture> {
  return page.evaluate(() => {
    const capture = (
      window as typeof window & { __trainingAttributionCapture: TrainingAttributionCapture }
    ).__trainingAttributionCapture;
    return JSON.parse(JSON.stringify(capture)) as TrainingAttributionCapture;
  });
}

export function buildTrainingAttributionProfileReport(
  profile: { name: string; width: number; height: number },
  capture: TrainingAttributionCapture,
): TrainingAttributionProfileReport {
  const completed = capture.timings.filter(
    (event) => event.stage === "transition.total" && event.outcome.endsWith("-ready"),
  );
  const acceptedCompleted = completed.filter(
    (event) =>
      event.outcome === "learn-ready" || event.outcome === "review-ready",
  );
  const completedIds = [
    ...new Set(acceptedCompleted.map((event) => event.transitionId)),
  ];
  const continueCompleted = completed.filter(
    (event) => event.outcome === "continue-ready",
  );
  const initialContinueEvent = continueCompleted.at(-1) ?? null;
  const initialContinueStart = initialContinueEvent
    ? capture.timings.find(
        (event) =>
          event.transitionId === initialContinueEvent.transitionId &&
          event.stage === "transition.start" &&
          event.outcome === "continue",
      )
    : null;
  const initialContinue =
    initialContinueEvent && initialContinueStart
      ? {
          transitionId: initialContinueEvent.transitionId,
          durationMs: initialContinueEvent.durationMs,
          visibleStates: capture.visibleStates.filter(
            (state) =>
              state.atMs >= initialContinueStart.observedAtMs &&
              state.atMs <= initialContinueEvent.observedAtMs + 50,
          ),
        }
      : null;
  const prefetchByTransition = completedIds.map((transitionId) => ({
    transitionId,
    outcomes: capture.timings
      .filter(
        (event) =>
          event.transitionId === transitionId &&
          (event.stage === "next-card.prefetch" ||
            event.stage === "next-card.preparation"),
      )
      .map((event) =>
        event.stage === "next-card.preparation"
          ? `preparation-${event.outcome}`
          : event.outcome,
      ),
  }));
  const allPrefetchOutcomes = prefetchByTransition.flatMap(
    (transition) => transition.outcomes,
  );
  const prefetchLifecycleCoverage = {
    hit: allPrefetchOutcomes.some((outcome) => outcome.startsWith("accepted-hit")),
    miss: allPrefetchOutcomes.includes("accepted-miss"),
    cancel:
      allPrefetchOutcomes.includes("cancelled") ||
      allPrefetchOutcomes.includes("preparation-cancelled"),
    fallback: allPrefetchOutcomes.includes("fallback"),
  };
  const requiredSurfaces = {
    auth: hasStage(capture, "auth.session"),
    preferences: hasStage(capture, "training.preferences"),
    hydration: hasStage(capture, "training.active-scope-hydration"),
    scenarios: hasStage(capture, "training.scenarios"),
    scheduler: hasStage(capture, "next-card.selection"),
    prefetch: hasStage(capture, "next-card.prefetch"),
    lookup: hasStage(capture, "next-card.lookup"),
    translation: capture.timings.some((event) => event.stage.startsWith("translation.")),
    audio: capture.timings.some((event) => event.stage.startsWith("audio.")),
    preparation: hasStage(capture, "preparation.total"),
    actionRequest: hasStage(capture, "review.mutation.request"),
    actionAggregate: hasStage(capture, "review.mutation"),
    network: hasStage(capture, "network.transfer"),
    render: hasStage(capture, "card.render"),
    endToEnd: completedIds.length >= TRAINING_ATTRIBUTION_TRANSITIONS,
    initialContinue: Boolean(initialContinue),
    prefetchPerAcceptedTransition: prefetchByTransition.every(
      (transition) =>
        transition.outcomes.some(
          (outcome) =>
            outcome.startsWith("accepted-hit") || outcome === "accepted-miss",
        ),
    ),
    prefetchHit: prefetchLifecycleCoverage.hit,
    prefetchMiss: prefetchLifecycleCoverage.miss,
    prefetchCancel: prefetchLifecycleCoverage.cancel,
    prefetchFallback: prefetchLifecycleCoverage.fallback,
    lookupCorrelation: hasCorrelatedStage(capture, "next-card.lookup"),
    audioCorrelation: capture.timings.some(
      (event) =>
        event.stage.startsWith("audio.") &&
        Boolean(event.requestId && event.serverTiming),
    ),
    actionCorrelation: hasCorrelatedStage(
      capture,
      "review.mutation.request",
    ),
  };
  const missingRequiredSurfaces = Object.entries(requiredSurfaces)
    .filter(([, present]) => !present)
    .map(([surface]) => surface);
  const stageDurations = new Map<string, number[]>();
  for (const event of capture.timings) {
    const values = stageDurations.get(event.stage) ?? [];
    values.push(event.durationMs);
    stageDurations.set(event.stage, values);
  }
  const overThreshold: TrainingAttributionProfileReport["overThreshold"] = [];
  const unclassifiedOverThreshold: TrainingTimingEvent[] = [];
  for (const event of capture.timings.filter(
    (candidate) => candidate.durationMs >= TRAINING_ATTRIBUTION_THRESHOLD_MS,
  )) {
    const category = classifyTrainingStage(event.stage);
    if (!category) {
      unclassifiedOverThreshold.push(event);
      continue;
    }
    const causalAttribution =
      event.stage === "transition.total"
        ? buildCausalAttribution(event, capture.timings)
        : null;
    overThreshold.push({
      ...event,
      category: causalAttribution?.criticalPath[0]?.category ?? category,
      componentStages: [
        ...new Set(
          capture.timings
            .filter(
              (candidate) =>
                candidate.transitionId === event.transitionId &&
                candidate.stage !== "transition.total",
            )
            .map((candidate) => candidate.stage),
        ),
      ],
      causalAttribution,
    });
  }
  return {
    profile,
    acceptedTransitions: completedIds.length,
    actionPaths: {
      learn: acceptedCompleted.filter((event) => event.outcome === "learn-ready").length,
      review: acceptedCompleted.filter((event) => event.outcome === "review-ready").length,
    },
    acceptedTransitionSummary: summarizeDurations(
      acceptedCompleted.map((event) => event.durationMs),
    ),
    initialContinue,
    prefetchByTransition,
    prefetchLifecycleCoverage,
    timingEventCount: capture.timings.length,
    transitionIds: completedIds,
    requestIds: [
      ...new Set(capture.timings.flatMap((event) => (event.requestId ? [event.requestId] : []))),
    ],
    visibleStates: capture.visibleStates,
    requiredSurfaces,
    missingRequiredSurfaces,
    summary: Object.fromEntries(
      [...stageDurations].map(([stage, values]) => [stage, summarizeDurations(values)]),
    ),
    overThreshold,
    unclassifiedOverThreshold,
  };
}

function buildCausalAttribution(
  total: TrainingTimingEvent,
  timings: TrainingTimingEvent[],
): NonNullable<
  TrainingAttributionProfileReport["overThreshold"][number]["causalAttribution"]
> {
  const transitionStart = total.monotonicStartedAtMs;
  const transitionEnd = total.monotonicEndedAtMs;
  const components = timings.filter(
    (event) =>
      event.transitionId === total.transitionId &&
      event.stage !== "transition.start" &&
      event.stage !== "transition.total" &&
      event.monotonicEndedAtMs >= transitionStart &&
      event.monotonicStartedAtMs <= transitionEnd,
  );
  const observedCategoryDurations: Partial<
    Record<TrainingAttributionCategory, number>
  > = {};
  const categorizedIntervals = new Map<
    TrainingAttributionCategory,
    Array<{ start: number; end: number }>
  >();
  for (const component of components) {
    const category = classifyTrainingStage(component.stage);
    if (!category || category === "end-to-end") continue;
    const interval = clipInterval(component, transitionStart, transitionEnd);
    if (!interval) continue;
    const intervals = categorizedIntervals.get(category) ?? [];
    intervals.push(interval);
    categorizedIntervals.set(category, intervals);
  }
  for (const [category, intervals] of categorizedIntervals) {
    observedCategoryDurations[category] = unionDuration(intervals);
  }
  const criticalStages = [
    "review.mutation",
    "next-card.selection",
    "preparation.total",
    "card.render",
  ];
  const stagePriority = new Map(
    criticalStages.map((stage, index) => [stage, index]),
  );
  const candidates = components
    .filter((event) => stagePriority.has(event.stage))
    .flatMap((event) => {
      const interval = clipInterval(event, transitionStart, transitionEnd);
      const category = classifyTrainingStage(event.stage);
      return interval && category ? [{ event, category, ...interval }] : [];
    })
    .sort(
      (left, right) =>
        left.start - right.start ||
        (stagePriority.get(left.event.stage) ?? 0) -
          (stagePriority.get(right.event.stage) ?? 0) ||
        left.end - right.end,
    );
  let claimedUntil = transitionStart;
  const criticalPath = candidates.flatMap(({ event, category, start, end }) => {
    const attributedStart = Math.max(start, claimedUntil);
    if (end <= attributedStart) return [];
    claimedUntil = end;
    return [
      {
        category,
        stage: event.stage,
        durationMs: Number((end - attributedStart).toFixed(1)),
        monotonicStartedAtMs: attributedStart,
        monotonicEndedAtMs: end,
      },
    ];
  });
  const criticalPathDurationMs = Number(
    criticalPath
      .reduce((sum, contributor) => sum + contributor.durationMs, 0)
      .toFixed(1),
  );
  return {
    rule:
      "Clip same-transition component intervals to the monotonic transition.total window. Build the critical path from aggregate mutation, scheduler selection, preparation, and render intervals in start-time/stage-priority order, attributing only each interval's portion after the previously claimed end so overlaps are never summed. Category evidence is the per-category interval union and may overlap other categories; it is diagnostic evidence, not an additive path.",
    causalCategories: Object.keys(
      observedCategoryDurations,
    ) as TrainingAttributionCategory[],
    observedCategoryDurations,
    criticalPath,
    criticalPathDurationMs,
    residualMs: Number(
      Math.max(0, total.durationMs - criticalPathDurationMs).toFixed(1),
    ),
  };
}

function clipInterval(
  event: Pick<
    TrainingTimingEvent,
    "monotonicStartedAtMs" | "monotonicEndedAtMs"
  >,
  windowStart: number,
  windowEnd: number,
) {
  const start = Math.max(windowStart, event.monotonicStartedAtMs);
  const end = Math.min(windowEnd, event.monotonicEndedAtMs);
  return end > start ? { start, end } : null;
}

function unionDuration(intervals: Array<{ start: number; end: number }>) {
  const ordered = [...intervals].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  let total = 0;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  for (const interval of ordered) {
    if (currentStart === null || currentEnd === null) {
      currentStart = interval.start;
      currentEnd = interval.end;
      continue;
    }
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
      continue;
    }
    total += currentEnd - currentStart;
    currentStart = interval.start;
    currentEnd = interval.end;
  }
  if (currentStart !== null && currentEnd !== null) {
    total += currentEnd - currentStart;
  }
  return Number(total.toFixed(1));
}

function buildSchedulerEntry(entry: FixtureEntry) {
  return {
    ...entry,
    mode: "word-to-definition",
    is_nt2_2000: true,
    meanings_count: 1,
    stats: {
      source: entry.id === entries[0]?.id ? "new" : "review",
      mode: "word-to-definition",
      interval: null,
      stability: null,
      new_today: 0,
      daily_new_limit: 30,
      new_pool_size: entries.length,
      learning_due_count: entries.length,
      review_pool_size: entries.length,
      next_review: null,
    },
  };
}

function buildLookupGroup(entry: FixtureEntry, learn: boolean) {
  const target = {
    kind: "sense-card" as const,
    entryId: entry.id,
    cardTypeId: "word-to-definition" as const,
    stateRevision: `state-${entry.id}`,
  };
  const capabilities = learn
    ? [
        {
          actionId: "start-learning" as const,
          elementId: "sense-card.learning.start",
          messageKey: "senseCard.learning.start",
          target,
        },
      ]
    : (["fail", "hard", "success", "easy"] as const).map((reviewResult) => ({
        actionId: "review-card" as const,
        elementId: `sense-card.review.${reviewResult}`,
        messageKey: `senseCard.review.${reviewResult}`,
        target,
        reviewResult,
      }));
  return {
    headwordGroupId: `group-${entry.id}`,
    dictionary: {
      dictionaryId: "fixture-dictionary",
      sourceLanguageCode: "nl",
      displayName: "Attribution dictionary",
      messageKey: "dictionary.source",
    },
    header: {
      text: entry.headword,
      article: entry.gender,
      partOfSpeech: {
        termId: "part-of-speech:substantief",
        messageKey: "partOfSpeech.source",
        sourceValue: entry.part_of_speech,
      },
      audio: {
        audioId: `audio-${entry.id}`,
        actionId: "play-audio",
        contentLanguageCode: "nl",
      },
    },
    senseCount: 1,
    entryCount: 1,
    indicators: [],
    entries: [
      {
        kind: "sense-card",
        entryId: entry.id,
        meaningOrdinal: 1,
        partOfSpeech: {
          termId: "part-of-speech:substantief",
          messageKey: "partOfSpeech.source",
          sourceValue: entry.part_of_speech,
        },
        card: learn
          ? null
          : {
              cardTypeId: "word-to-definition",
              scheduler: { phase: "learning", repeatCount: 3 },
              knownMark: null,
              stateRevision: `state-${entry.id}`,
            },
        contentRevision: `content-${entry.id}`,
        summaryContentNodeId: `definition-${entry.id}`,
        contentNodes: [
          {
            contentNodeId: `definition-${entry.id}`,
            parentContentNodeId: null,
            kind: "definition",
            order: 0,
            text: entry.raw.meanings[0]!.definition,
            sourceTextFingerprint: `fingerprint-${entry.id}`,
            translations: [],
          },
        ],
        translation: {
          translationId: `translation-${entry.id}`,
          entryId: entry.id,
          targetLanguageCode: "ru",
          status: "ready",
          text: `перевод ${entry.headword}`,
          sourceContentFingerprint: `content-${entry.id}`,
          translationPolicyVersion: "attribution-fixture-v1",
          isFresh: true,
        },
        capabilities,
      },
    ],
  };
}

function learningPreferences() {
  return {
    training_mode: "word-to-definition",
    modes_enabled: ["word-to-definition"],
    card_filter: "both",
    language_code: "nl",
    new_review_ratio: 2,
    active_scenario: "understanding",
  };
}

function wordListSummary() {
  return {
    id: "list-attribution",
    slug: "attribution-list",
    name: "Attribution list",
    language_code: "nl",
    primary_language_code: "nl",
    is_primary: true,
    word_list_items: [{ count: entries.length }],
  };
}

function hasStage(capture: TrainingAttributionCapture, stage: string) {
  return capture.timings.some((event) => event.stage === stage);
}

function hasCorrelatedStage(
  capture: TrainingAttributionCapture,
  stage: string,
) {
  return capture.timings.some(
    (event) =>
      event.stage === stage && Boolean(event.requestId && event.serverTiming),
  );
}

function summarizeDurations(values: number[]): DurationSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? 0,
  };
}

function classifyTrainingStage(stage: string): TrainingAttributionCategory | null {
  if (stage === "auth.session") return "auth";
  if (stage.startsWith("training.")) return "hydration";
  if (
    stage === "next-card.selection" ||
    stage === "next-card.prefetch" ||
    stage === "next-card.preparation"
  ) {
    return "selection/scheduler";
  }
  if (stage === "next-card.lookup") return "lookup";
  if (
    stage.startsWith("translation.") ||
    stage.startsWith("audio.") ||
    stage === "preparation.total"
  ) {
    return "translation/audio preparation";
  }
  if (stage.startsWith("review.")) return "mutation";
  if (stage === "network.transfer") return "network";
  if (stage === "card.render") return "render";
  if (stage === "transition.total") return "end-to-end";
  return null;
}

function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
