# 2000NL Action Plan For AudioFilms YouTube Extension Review

Date: 2026-06-18

Completion status: completed on 2026-06-18 for the 2000NL-side AudioFilms
handoff. Deferred items remain intentionally out of scope unless promoted into a
new plan.

Source reviews live in the AudioFilms repository:

- `/Users/khrustal/dev/audiofilms/docs/design-handoff/youtube-extension-architect-review/review01.md`
- `/Users/khrustal/dev/audiofilms/docs/design-handoff/youtube-extension-architect-review/review02.md`

This is the 2000NL-side action plan. Run the AudioFilms-side plan in parallel
from `/Users/khrustal/dev/audiofilms/docs/exec-plans/active/youtube-extension-architect-review-audiofilms-action-plan.md`.

## Goal

Make 2000NL the safe platform authority for AudioFilms YouTube dictionary and
practice features:

- public/guest lookup does not run under a shared end-user identity;
- platform lookup has useful external-click search semantics, not only V2 echo
  metadata;
- dictionary card capabilities are state-aware and card-type-specific;
- session and translation preference resolution are exposed through platform
  APIs;
- normalized dictionary content is stable enough for compact cards now and
  line-level overlays later.

## Inputs To Read First

- `AGENTS.md`
- `docs/reference/platform-api.md`
- `docs/reference/connect-api.md`
- `packages/shared/types/platform.ts`
- `apps/ui/lib/platform/platformApi.ts`
- `apps/ui/app/api/platform/v1/lookup/route.ts`
- `apps/ui/app/api/platform/v1/actions/route.ts`
- `apps/ui/app/api/platform/v1/translation/route.ts`
- `apps/ui/app/api/platform/v1/analyze-selection/route.ts`
- `apps/ui/tests/api/platformV1Routes.test.ts`
- `apps/ui/tests/api/platformLookupRoute.test.ts`
- `apps/ui/tests/api/platformActionsRoute.test.ts`
- `apps/ui/tests/api/platformAnalyzeSelectionRoute.test.ts`
- `apps/ui/tests/api/platformTranslationRoute.test.ts`
- `db/migrations/004_user_features.sql`
- `db/migrations/064_multilanguage_scope_rpcs.sql`

## P0: Public Catalog / Guest Lookup Boundary

Architect finding:

- AudioFilms must not use `DICTIONARY_2000NL_ACCESS_TOKEN` as a shared
  end-user fallback for guest lookup.
- `includeUserState: false` is not enough if the lookup still runs under a
  private user's identity and can see private dictionaries.

Actions:

- Design and implement one explicit guest-safe lookup boundary:
  - preferred: `POST /api/platform/v1/catalog/lookup` using a public-catalog
    service credential; or
  - an explicitly public endpoint hard-limited to system/public dictionaries.
- Ensure the endpoint cannot:
  - read private user dictionaries;
  - return user state, list memberships, or progress;
  - invoke or imply action capability;
  - use a normal user Supabase JWT as service identity.
- Document how AudioFilms should authenticate guest lookup.
- Add tests proving private/user dictionaries are not visible through the public
  catalog boundary.

Acceptance checks:

- There is a platform-supported credential/endpoint that AudioFilms can use for
  guest dictionary lookup without impersonating a user.
- Existing authenticated lookup remains available for connected users.
- Platform docs clearly distinguish user lookup from catalog lookup.

## P1: External-Click Lookup Search Semantics

Already done after the first review:

- `POST /api/platform/v1/lookup` accepts and echoes `languageCode`,
  `contextText`, and `intent`;
- no-result responses preserve `request` metadata;
- normalized `entry.content` and `contentFingerprint` are exposed;
- match object exists.

Remaining issue:

- Runtime lookup still resolves candidates through exact headword RPC behavior
  and does not use language/context as search inputs.

Required semantics before functional Dictionary V2:

- language filtering;
- exact-headword matching;
- indexed inflection/form matching;
- best-first result ordering;
- truthful match evidence.

Match contract:

```ts
match: {
  queriedForm: string;
  matchedForm?: string;
  relation: "exact" | "inflection" | "lemma" | "fuzzy" | "unknown";
}
```

Actions:

- Reuse or extend migration `064_multilanguage_scope_rpcs.sql` search machinery,
  especially indexed-word-form behavior from `search_word_entries_gated`.
- Add a dedicated external-click lookup path/RPC if the existing gated headword
  RPC cannot provide truthful match evidence.
- Apply `languageCode` as a real filter.
- Keep `contextText` accepted/echoed, but do not claim it affects ranking until
  it actually does.
- Return `exact`, `inflection`, or `lemma` only when the search pipeline has
  evidence for that relation; otherwise return `unknown`.
- Add tests for:
  - exact Dutch headword;
  - Dutch inflected/clicked form;
  - same visible token in another language scope;
  - no result with request metadata preserved.

Defer:

- context-semantic ranking;
- fuzzy typo handling.

## P1: State-Aware Card Capabilities

Already done after the first review:

- `cardCapabilitiesByType["word-to-definition"].actions` exists;
- its actions are limited to card actions, not broad list/dictionary operations.

Remaining issue:

- Current capabilities still return too many actions/results for every phase.

Canonical phase model:

```ts
phase:
  | "not-started"
  | "encountered"
  | "learning"
  | "reviewing"
  | "hidden"
  | "frozen";
```

Required action gating:

- `not-started` or `encountered`: `start-learning`, `mark-known`;
- `learning` or `reviewing`: `review-card` with allowed results;
- `hidden` or `frozen`: no first-redesign progress actions.

Actions:

- Make `cardCapabilitiesByType.actions` phase-aware.
- Make `reviewResults` phase-aware:
  - only present when `review-card` is currently allowed;
  - values: `fail`, `hard`, `success`, `easy`.
- Keep item-level `availableActions` as legacy/diagnostic only; do not broaden
  card capabilities from it.
- Confirm `hidden` is the canonical persisted platform state.
- Treat `Known` as a display label/action in AudioFilms, not a persisted
  platform status.
- Add tests for every phase and its allowed action set.

Open product/semantics check:

- Today `mark-known` behaves like an `easy` review and the refreshed card can
  become `reviewing`. If product intent is "remove from study", change platform
  semantics deliberately instead of letting AudioFilms simulate it.

## P1: Idempotency And Review Turn IDs

Architect finding:

- AudioFilms should send a client-generated `turnId` for `review-card`,
  `mark-known`, and `mark-unknown`, and reuse it across retries.
- 2000NL must reliably deduplicate review-backed actions.

Actions:

- Verify current action API requires or safely accepts `turnId` for:
  - `review-card`;
  - `mark-known`;
  - `mark-unknown`;
  - any action implemented as a review/scheduling mutation.
- Add tests for retrying the same action with the same `turnId`.
- Return stable responses for duplicate retries.
- Keep plain lookup and card rendering read-only. Do not auto-call
  `record-view` for YouTube word clicks.

## P1: Normalized Dictionary Content V2

Already done after the first review:

- `entry.content` and `contentFingerprint` are available.

Remaining issue:

- Compact cards are supported, but line-level overlays and full rich cards need
  stable typed content nodes.

Required future node model:

```ts
sections: Array<{
  id: string;
  sourcePath: string;
  kind: "meaning" | "example" | "idiom" | "form" | "note";
  label?: string;
  text: string;
  translation?: string;
}>;
```

Actions:

- Make `entry.content`, `contentFingerprint`, and `match` required for V2 lookup
  responses.
- Define `contentFingerprint` as a versioned fingerprint of canonical
  learner-visible content, excluding volatile diagnostics such as `sourceMeta`.
- Resolve shared-type/runtime nullability mismatches:
  - `dictionaryId`;
  - `languageCode`;
  - normalized content language defaults.
- Either guarantee non-null values or model them as nullable; do not silently
  infer `"nl"` where the source did not provide it.
- Add stable `sections[]` IDs/source paths before promising line-level
  definition/example/idiom translation placement.

Acceptance checks:

- Compact AudioFilms card can render from `entry.content` only.
- `entry.raw` is still available for diagnostics but not required by external
  clients.
- Tests assert required V2 fields and fingerprint stability.

## P1: Session Preference API

Required preference path:

```text
2000NL user_settings
  -> GET /api/platform/v1/session
  -> AudioFilms GET /api/dict/session
  -> extension UI
```

Platform response target:

```ts
{
  user: {
    id: string;
    email: string | null;
  };
  preferences: {
    translationTargetLanguageCode: string;
    source: "user-setting" | "platform-default";
    updatedAt: string | null;
  };
}
```

Actions:

- Add/complete `GET /api/platform/v1/session`.
- Resolve `translationTargetLanguageCode` from `user_settings.translation_lang`.
- Return explicit platform default when setting is missing.
- Do not rely on Connect token metadata as authoritative preference state.
- Add tests for:
  - explicit user setting;
  - missing setting -> platform default;
  - `off`/disabled setting if still supported by product semantics;
  - unauthenticated request behavior.

## P1: Translation APIs And Artifact Identity

Card translation:

- Existing `/api/platform/v1/translation` remains entry-based dictionary-card
  translation.
- It should allow `targetLang` to be omitted and resolve the user's current
  preference server-side.
- It should always return the resolved target language.

Actions:

- Make `targetLang` optional for authenticated card translation.
- Return `authentication_required` for guests if target preference cannot be
  resolved safely.
- Type card-translation overlays against stable content paths before line-level
  placement is promised.
- Keep provider names in diagnostics, not the AudioFilms UI contract.

Generic text translation:

Required endpoint:

```http
POST /api/platform/v1/text-translation
```

Response target:

```ts
{
  translationId: string;
  status: "ready" | "pending" | "failed";
  sourceTextHash: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  translatedText?: string;
  translationPolicyVersion: string;
  cached: boolean;
}
```

Actions:

- Add/complete the route implementation if tests already exist without route
  coverage.
- Define source language, optional target language, purpose, context, and policy
  version inputs.
- Make 2000NL own provider/prompt policy and canonical cache keys.
- Use one semantic purpose for AudioFilms phrase practice, for example
  `youtube-phrase-practice`.
- Add tests for pending/ready/failed/cached states and preference resolution.

## Validation

Run narrow checks for touched files:

```bash
cd apps/ui
npm run typecheck
npm run lint
npm run test:platform
```

If changing SQL/RPC behavior, also run the relevant database-backed tests or
document the required Supabase test DB command.

## Defer

- Direct extension calls to 2000NL generic platform endpoints.
- Context-semantic and fuzzy ranking until language/form matching is complete.
- Automatic YouTube encounter recording.
- Recall reverse-token lookup.
- Hidden-card restore, list management, and dictionary copying for the YouTube
  overlay.
- Cancellation and ETA for AudioFilms practice jobs.
