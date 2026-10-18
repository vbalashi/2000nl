# AudioFilms ASR continuation: two additional sources

2026-10-18; #742/#744/#745/#747. Owner explicitly authorized existing AudioFilms
endpoint audio extraction/transcription and preferred own ASR for Easy Dutch.
This supersedes the pending source choice in [the prior checkpoint](RESULT-20261018.md).
It does not establish own-ASR superiority over YouTube captions; no reference/WER
comparison was performed.

## Actual source and ASR execution

Used existing `POST /api/asr/jobs`, status and result endpoints on the deployed
AudioFilms API through the existing Dell SSH connection to localhost:3010. Public
hostname returned403; obsolete LAN address timed out. No deployment, auth, provider
ordering or AudioFilms source code changed. Two authorized ASR jobs were created;
no2000NL dictionary, collection or learning-state writes occurred.

| Source | Video length | ASR job running time | ASR phrases | Prepared tokens / alphabetic | Lemma/POS candidates |
| --- | --- | --- | --- | --- | --- |
| [Easy Dutch: COMPLIMENTS](https://www.youtube.com/watch?v=IoTEYzkKF0M) | 14:38 | 12:42.177 | 361 | 3,201 /2,604 | 399 |
| [LUBACH: Q&Arjen](https://www.youtube.com/watch?v=9ZQaqL7K-rE&t=219s) | 11:07 | 3:15.913 | 276 | 1,985 /1,543 | 328 |

These are job started→completed intervals, including audio retrieval and ASR, not
client wait or inference-only times. Easy:20:17:10.093Z→20:29:52.270Z;
LUBACH:20:32:25.420Z→20:35:41.333Z (Europe/Amsterdam UTC+2).
Full video text was used;219s remains playback observation, not an excerpt boundary.

Easy used an878s bounded request; LUBACH used fullAudio with a667s source. Easy's
bounded ffmpeg download/conversion occupied approximately7:23 before Python ASR;
LUBACH switched to Python in roughly3s. A separate full-file LUBACH language probe
downloaded10.8MB in2.34s. This suggests investigating the bounded section-download
path, but different videos/network conditions mean **no controlled speedup claim**.

AudioFilms correctly rejected the first LUBACH request with missing_audio_track_evidence:
yt-dlp exposed an unnamed default audio family without language metadata. An
operator preflight downloaded that default audio and used the existing Whisper
model with automatic language detection, **without iterating transcription segments**.
Result nl, probability0.996949;8.90s language-probe/model-load work. This real evidence
was supplied to the endpoint; no fabricated language fields or validation bypass.
The actual transcript still came from the subsequent AudioFilms ASR job. Temporary
probe audio was fingerprinted and removed after completion; application ASR cache
was left intact.

Runtime: faster-whisper1.2.1 / ctranslate2 4.8.0,
`mobiuslabsgmbh/faster-whisper-large-v3-turbo`, CPU/int8;
worker image `sha256:30246a854911f73015732be1d4101e13e1609518f587fee3e6909ab14dbeb1b3`.
Both result metadata sets reported sourceKind=provider, retrievalPath=asr-job…, no
quality flags. Those flags are timing diagnostics, **not a linguistic quality score**.
Requested ASR language and independent language detection are kept distinct.

## Source preparation and bounded coverage

New `asr_capture.py` operator adapter calls the existing API and normalizes results
with job/source receipts. `prepare.py --allow-asr` explicitly accepts that provenance;
manual-only remains the default. Generated ASR is never relabeled author captions.

Preparation Easy0.994s /227.1MB peak RSS; LUBACH0.785s /202.4MB peak RSS.
Raw text, source offsets, cue IDs and all candidate occurrences remain in private
artifacts. Known is not used as an exclusion. This is still Dutch spaCy extraction,
not a finished multilingual list parser or proper-name/foreign-word noise classifier.

| Coverage | Easy Dutch | LUBACH |
| --- | --- | --- |
| Baseline query plan | 500submitted;136additional queries explicitly deferred | 472submitted;0deferred |
| Extra phrase/component queries | 18 | 16 |
| Lemma candidate retrieval counts (empty /single /multiple) | 47 /137 /215 | 56 /112 /160 |
| Contextual resolver sample | 12cases | 12cases |
| Word candidates outside the semantic sample | 391 | 320 |

New query planner prioritizes lemmas, particle proposals, forms, then syntactic
phrases; overflow is queued, not treated as a completed empty search. These are
submitted query counts (extra component queries can repeat baseline queries).
Distinct query counts/timing totals are in [result JSON](asr-result-20261018.json).
The frozen resolver fixtures deliberately filter **nl-vandale**. Missing in this
snapshot is **not** missing from every accessible/private dictionary. A production
all-dictionaries search/coverage contract still needs implementation.

Same resolver prompt v3, SDK and Azure model as before; optional lean projection
retains entry IDs, definitions/examples but omits internal content-node bindings and
headword-group metadata from model payloads. Discovery gets sentenceId/text instead
of irrelevant timing metadata. This changes input projection, so it is not a direct
controlled quality/performance comparison with the earlier full projection.

## Resolution and generation

Both sources completed both SDK resolver batches within their turn caps; no resolver
retry or restricted finalization was needed. This is mechanical execution success,
not12/12semantic accuracy. No independent linguistic gold was prepared.

| Outcome | Easy Dutch | LUBACH |
| --- | --- | --- |
| Existing target selected | 5 | 5 |
| not_found in current snapshot | 7 | 6 |
| needs_user | 0 | 1 |
| New unreviewed expression drafts | 4 | 2 |
| Resolver task wall time sum, nested generation included | 16.22s | 28.84s |

Actual existing-first examples: LUBACH resolved `af en toe` to an existing idiom.
For `op je bek gaan`, two meanings were found and the model requested user resolution
rather than inventing a target or generating a replacement. This demonstrates the
branch, not proof that every proposed sense decision is correct.

Six new generator requests were actual resolver calls to personal_draft_propose.
The generator had a closed schema and no write tools. Headword/definition/example/
grammar fields, generated status and source revision are saved as proposals only.
All relatedEntryRefs remain empty; live component-link selection/persistence is not
demonstrated. The word-only missing queue was not automatically sent to generation.

| Generated headword | Generated definition |
| --- | --- |
| op eigen benen staan | Zelfstandig zijn en voor jezelf kunnen zorgen, zonder afhankelijk te zijn van anderen. |
| trots als een pauw | Heel trots zijn. |
| iets op de rit krijgen | Ervoor zorgen dat iets weer goed en volgens plan verloopt. |
| er dan ook iets achter zoeken | Denken dat iets een verborgen bedoeling of extra betekenis heeft. |
| bij machte zijn | In staat zijn om iets te doen. |
| buiten m'n comfort zone | In een situatie zijn die onbekend of spannend is en waarin je je niet op je gemak voelt. |

[All generated fields for review](asr-draft-proposals-20261018.json). Two
surface-heavy titles `er dan ook…` and `buiten m'n…` illustrate a normalization gap:
remove conversational additions/use a canonical learning form after semantic review,
without silently rewriting the source. Definitions/examples here are unreviewed.
No global-absence or duplicate-free guarantee, no saved personal articles/members.

## A real validation failure and deterministic handling

LUBACH discovery's original API response proposed lower-case `op je bek gaan` for
source sentence `Op je bek gaan.`. The exact substring gate rejected the entire
batch. Original API response and failure retained. The validator now permits only a
**unique case-insensitive source match**, copies actual source casing into the
anchored proposal and records modelSurface/sourceSurface/reason. Missing text,
paraphrases and ambiguous case-only matches still fail; source text remains intact.

The recorded response was offline-normalized under this rule; **no additional
model call** or manually invented phrase was used. This recovery must not be called
a new successful autonomous live discovery pass. Future runs use the updated rule.
No relaxation of dictionary identity, semantic selection or reference validation.

26focused tests pass, including ASR/manual provenance separation, explicit ASR opt-in,
query overflow retention, unchanged semantic fields in lean projection, source casing
receipt, ambiguity rejection and the earlier scope/draft/cost gates. No app UI tests
or deployment were needed for these research-only changes.

## Cost and resource evidence

| New model work, all discovery/resolution/generation included | Requests | Published estimate USD |
| --- | --- | --- |
| Easy Dutch | 11 | $0.00310323 |
| LUBACH | 10 | $0.003203125 |
| **This continuation** | **21** | **$0.006306355** |

54,755input tokens (3,174ordinary +24,158cache reads +27,423cache writes),4,639output
including reasoning.21HTTP200responses with usage, no token-total discrepancies or
unanswered requests. Dated published Luna Global Standard USD/1M rates remain
0.10/0.01/0.125/0.50ordinary/read/write/output:
[Microsoft rate source](https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/).
This is not an attributed invoice or the price of semantically processing all words.

Inherited transfer cap48 includes prior18calls; now39/48used. Overall research total
66requests, estimated$0.036320525including previous experiments. No automatic budget
reset or spending of the remaining allowance. Azure inference only; SDK trace export
disabled and no credentials printed/persisted.

Whisper ran on the existing own worker; external paid speech APIs were not called.
**ASR monetary compute/storage cost is unpriced, not zero.** One sample during Easy
ASR:384%CPU (~3.8logical CPUs),2.384GiB memory; this is not peak/integrated utilization.
WAV cache154,882,126bytes Easy /117,739,598bytes LUBACH; word JSON850,634/526,224bytes.
The actual audio/cache lifetime and worker capacity policy are separate from text
retention. No existing AudioFilms cache was deleted or retention setting changed.

## Remaining boundaries

Verified external paths now cover all three additional user video sources through
manual captions or authorized own ASR. **Per-video semantic coverage is still a
selected12case slice**, not a complete autonomous collection plan. Still needed:

- server coordinator for preparation/coverage/resolution/generation, job status and
  phase closure; AudioFilms already owns its ASR job lifecycle;
- full authorized dictionary scope, retrieval completeness and source-language/noise
  handling; dictionary sense quality independent from mechanical ID acceptance;
- canonical draft headwords and optional component-reference contract;
- approved save-only personal projection→collection membership, idempotency and
  failure recovery without implicit learning actions; generated phrase identity;
- review/edit UX and independent quality evidence before automatic acceptance.

Existing app generated preview/save services are reusable building blocks, not this
completed flow. No app integration or production generated-card save was performed.
