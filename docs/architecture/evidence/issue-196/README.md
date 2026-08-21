# Issue #196: `typisch` prompt diagnosis

Date: 2026-08-21
Fixed point: `1f7e5e33ccac33c7d7b902191c0af1b12a3ef558`

## Safe production observation

Read-only catalog/service queries identified public dictionary entry
`1b636b1b-0ba1-4f29-a52d-0b45fdbaba8d`, meaning 1. No learner account or
learner state was read or changed.

The ready Russian OpenAI artifact (`df76239a-8292-40ca-8205-a457e7acf9b3`)
was updated at `2026-08-14T05:11:13.431Z` and records:

- primary: `типичный`;
- alternatives: `характерный`, `свойственный`;
- example: `как странно, что мы не увиделись на том конгрессе!`;
- provider revision: `316deeb28892b1cdebfe5c12c2cd620b5b8f29289c1ffe3d4f5fc1b2e6a4ea7d`;
- policy: `dictionary_meaning_v1:316deeb...`.

That provider revision is exactly SHA-256 of `"\n---\n"`: the fingerprint
produced when both prompt files load as empty strings. The current non-empty
dictionary-meaning prompt fingerprint is
`109cf135d00a9c5e7977c52f7dd4cb843360a1e4c0d924efe22b19ebc1cf3253`.

## Diagnosis

The Docker runner copied Next's standalone output but not the dynamically read
`.txt` prompt files. `loadPromptText` then swallowed the missing-file error and
returned an empty string. Production therefore sent the structured meaning
payload and response shape without either instruction that the selected meaning
controls `primaryText` or the instruction that the common context-free sense
belongs in `baseText`. With the headword preceding definition and example in the
payload, the provider selected its common dictionary sense even while translating
the example contextually.

This is a missing production prompt, not evidence that the current prompt wording
needs a broader rewrite. The exact current request, with the actual current prompt,
returned `странный` as primary and `типичный` as base in six consecutive baseline
runs.

The bounded machine-readable record is
`live-eval-current-prompt.json` (SHA-256
`5c7a2fcc54d73da44c91ce8accdf69207d9e3f777933ed63d9a5bf724471082b`).
It contains the exact request and its fingerprint, source and prompt identity,
and only primary/base/evaluation outputs. It contains no credentials, request
headers, or raw provider response.

## Fix and regression boundary

- The production Docker image explicitly copies all translation `.txt` prompts.
- Missing or empty prompt files now fail closed before a provider call.
- The deterministic `typisch_bn_strange` eval accepts a primary containing the
  Russian stem for strange/unusual/remarkable and rejects the stems for
  typical/characteristic.
- The eval request pins the exact production entry, source revision, definition,
  example, language, and part of speech.
- The existing neighbouring meaning cases were rerun with the same current prompt;
  the three executable `goed` sense checks passed (`товар`, `благо`, `ткань`).
  Cases without an executable primary-text rule are explicitly reported as
  `not-configured`, never as a passing check.

## Artifact decision

No database invalidation and no bulk retranslation are part of this change. The
`typisch` row already fails the normal current-policy comparison (`316deeb...`
versus `109cf135...`). After rollout, request its translation through the normal
coordinator and confirm a ready artifact with provider revision `109cf135...` and
the contextual primary. Other old artifacts remain subject to the normal lazy
freshness policy; any corpus-wide regeneration requires separate evidence and a
rollout decision.

## Verification

- focused translation tests: 22 passed;
- full UI suite: 738 passed, 96 skipped;
- typecheck: passed;
- lint: passed;
- production Next build with configured public credentials: passed;
- Docker image build: passed;
- container contains four `.txt` prompts; dictionary prompt lengths are 658 and
  806 bytes and their fingerprint is `109cf135...`.
