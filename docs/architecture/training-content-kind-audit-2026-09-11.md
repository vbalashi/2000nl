# Training content kinds: production failure and bounded correction

Evidence: [#325](https://github.com/vbalashi/2000nl/issues/325).
Base: `eb7a9a3c73ffdd292d7130735c85c81a0bbfbc2b` / production 0.18.599.
Broader product decisions: [#195](https://github.com/vbalashi/2000nl/issues/195).

## Confirmed production case

Reload → Continue → Mark as known showed `reverse-definition-missing` at 2/10.
The V2 lookup returned HTTP 200 for `klaar`, sense 2
(`3d0d53cd-11a5-44ad-ae55-46b0300fa1b2`). Its nodes were:

- idiom: `ergens helemaal klaar mee zijn`;
- its idiom-explanation: `iets helemaal niet meer willen, omdat je het vervelend vindt`;
- its example: `ik ben helemaal klaar met zijn gezeur`.

The explanation was present in the response. The session gate and Face renderer
required a root `definition`, rejecting the explained idiom. Another sense's
definition must not be substituted. `preparation.total=failed:ready` separately
means translation failed / audio ready; it is not this validation failure.

## Closed content vocabulary

The current Platform V2 contract contains exactly six kinds
(`packages/shared/types/platformV2.ts`, validated by `platformV2Runtime.ts`).
Source mapping lives in `apps/ui/lib/platform/platformV2RichContent.ts`;
`platformV2SenseContent.ts` preserves ordering, parent ownership, translations
and report identities. The Training model's arrays named `definitions` and
`examples` are section groupings, not semantic types.

| Kind | Source / meaning | Training Answer | Reverse cue after this correction |
| --- | --- | --- | --- |
| `definition` | Meaning definition | Definitions | First nonblank root definition, as before |
| `usage-pattern` | Meaning context / construction | Usage | No: a construction is not automatically an explanation |
| `example` | Meaning or idiom example | Examples / owned subtree | No: example-only requires a separate recall policy |
| `idiom` | Expression | Idioms | Not itself the reverse cue |
| `idiom-explanation` | Explanation owned by an expression | Owned idiom subtree | Yes, when attached to the single root idiom and no usable root definition exists |
| `usage-note` | Meaning note | Notes | No: support text is not automatically a recall cue |

## Implemented boundary

`selectTrainingReversePrompt` is shared by session validation and Face rendering.
It uses the existing projected tree, preserves the chosen node's type and
identity, and accepts a nonblank explanation only under its explicit idiom
parent. Answer retains the original expression, explanation and examples.
No new API node kind, corpus rewrite, learning action or scheduler mutation is
introduced. User authorization for #325 covers this narrow correction; it does
not settle the entire #195 prompt matrix or change forward/listening behavior.

## Remaining risks and decisions

- Multiple idioms without a definition: deliberately unresolved. Choosing the
  first expression silently would change the recall target for the whole entry.
- Expression-only, example-only, usage-only: content is valid for display, but
  requires an explicit mode-specific prompt policy. They remain unsupported as
  reverse cues; this correction does not claim to resolve them.
- Orphan explanations or blank text: never borrow a sibling sense or unrelated
  explanation. Validation/data diagnostics should identify malformed ownership.
- Forward/listening idiom-only prompts still use the headword; #195 tracks the
  expression-versus-headword recall decision and audio implications.
- Cross-reference/pointer entries are a separate entry variant, not a seventh
  content kind; scheduler exclusion and reference resolution remain separate.
- Generated/private entries use the same public kinds and need the same
  semantic checks; provenance alone does not supply a missing recall cue.
- Prefetch currently tests lookup readiness, whereas rendering also checks
  content suitability. Other unsupported combinations can still reach the
  failure screen. Do not automatically retire valid sparse content without a
  product decision on its supported mode.
- Retry replacement and the presentation ordinal can advance without a history
  event. The counter/replacement part of #325 and naming issue #298 remain open.

This is a contract/code inventory, not a corpus-frequency audit. It establishes
possible combinations, not their prevalence. The next broader study should
count these combinations by mode and review concrete entries before choosing
additional fallbacks.

## Regression coverage

The real `klaar` node shape is replayed through the session component in fresh
lookup and prefetched paths: it must show the explanation, avoid failure or
progress callbacks on load, and reveal the owned expression/examples on Answer.
Both tests failed with `reverse-definition-missing` before the correction.
Selector tests cover all six kinds, definition priority, blank text, orphan
ownership, reordered nodes and multiple-idiom ambiguity.
