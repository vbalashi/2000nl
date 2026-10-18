# External caption-import pilot (#742)

These are operator-run research adapters, not deployed app tools. Read the
[stage plan](../../../docs/research/agent-import-742/pilot/PLAN.md) first.

- `capture.cjs <audiofilms/app> <video-id> <output.json>` reuses the existing
  AudioFilms `YtDlpProvider` with Dutch/manual selected explicitly. Requires that
  app's existing jiti dependency and yt-dlp (`YT_DLP_PATH` override supported).
  It never calls the provider factory/paid fallback or ASR. AudioFilms is unmodified.
- `prepare.py <captions.json> <prepared.json>` uses pinned Dutch spaCy model,
  retains source offsets/occurrences, proposes word lemmas and syntactic expressions.
  Proposals are not accepted dictionary identity. No Known filter exists.
- `lookup.py <prepared.json> <output-dir> --email <authorized-owner> --reference
  <reference-checkout>` calls the existing read-only Platform lookup RPC in chunks
  under statement deadlines using the operator's configured DB wrapper. This is a
  privileged maintenance/research boundary, **not** a model-callable user-ID API.
  Only the explicitly authorized owner may be selected. Limit500 queries, chunks≤16,
  sequential execution. Scope/queries must match checkpoint; fresh directory for a
  changed scope. Pilot accounts for the initial historical unscoped cache separately.

Install requirements in an isolated venv; `requirements.lock` records this run.
Do not copy app env files or node_modules. Store raw captions, dictionary payloads,
owner IDs, review decisions and mutation receipts outside Git, e.g. ignored `tmp/`.
The published report contains only sanitized counts and short error examples.

Run meaningful preparation checks:

```sh
python -m unittest discover -s scripts/research/agent-import-pilot -p 'test_*.py' -v
```

Selection in the first run was reviewed by the in-session agent against real source
contexts and returned dictionary definitions; frozen private decisions/manifest
are retained with the run. This code does not claim an autonomous semantic resolver,
LLM cost measurement, generated-entry flow, production job queue or general idiom
recognizer. Collection writes used existing owner-checked RPCs with dry-run rollback,
then a single approved transaction; no write script is exposed as an agent tool.

## Azure model-loop experiment

`make_agent_fixture.py` freezes12same-video cases from private pilot evidence; labels
remain local and are never model input. `agent_tools.py` implements4bounded snapshot
read tools plus strict outcome/ID checks. `agent_compare.py` compares one-shot,
manual Responses loop and local OpenAI Agents SDK against one explicitly selected
Azure deployment using existing in-memory Entra authentication. It makes real paid
inference calls; do not run without task authorization. Use `--prior-ledger` for
authorized continuation; the18request total includes prior attempts. Fail closed on
changed config, unauthorized URLs/model/storage, invented IDs and exhausted caps.

`agent-requirements.lock` pins the actual experiment environment. SDK trace export
is disabled; request bodies/results remain in ignored restricted evidence. Do not
print tokens, upload raw journals or expose operator lookup as a model SQL tool.
Read the [complete result and failures](../../../docs/research/agent-import-742/agent-flow/RESULT-AZURE-20261018.md) before reusing code. Historical outputs retain
their original validator failures; offline revalidation is labeled separately.

### V4 optional hardened resolver

Use `agent_compare.py ... --hardened --modes direct,sdk` with resolver-v3.txt.
New phase cap12 HTTP requests, direct4responses/task, SDK2x3turns/task. Preserve
prior ledgers separately and report cumulative spend; this is no implicit renewal
of the original18request budget. Short transport aliases decode before validation.
Per-item accepted outputs survive mechanical failures in task receipts; this is
not server job durability. `summarize_cost.py LEDGER... --output REPORT` applies
dated published Luna rates, partitions input cache fields and never claims invoice
reconciliation. See RESULT-AZURE-V4-20261018.md for observed results/limitations.

## New-video / private draft transfer slice

`transfer_run.py discover VIDEO_DIR PHASE_DIR` discovers at most4anchored phrase
proposals. Populate separate `phrase-lookup.json` through the existing operator
lookup, then `transfer_run.py resolve VIDEO_DIR PHASE_DIR` freezes first4ambiguous
+first4missing word candidates +discovered phrases. No oracle labels. This is a
bounded sample, not all-video semantic processing. A fifth function tool calls a
separate minimal private draft Agent; no save tool exists.

Phase cap48new HTTP requests,96KiB/request,768KiB cumulative,20min from first request,
4096output tokens/request,no retries. Counts include nested generators and failed
attempts. The first live run exposed turn exhaustion at3and6turns; preserve failures.
`finalize` is a deliberately narrow recovery for this recorded second batch when
its last pending calls are completed draft requests. It makes one no-tools model
call from saved receipts. It is not a general production resume implementation.
Do not use it for arbitrary pending reads or claim the failed loop was uninterrupted.
See `multivideo/RESULT-20261018.md` for actual scope, errors, costs and pending sources.

## Authorized own-ASR continuation

`asr_capture.py create|status|result VIDEO_DIR [--full-audio]` calls the existing
AudioFilms HTTP API via an existing SSH connection (default Dell). It reuses saved
job receipts, never refreshes, honors the endpoint's validation and keeps ASR source
metadata. `audio_language_probe.py VIDEO_DIR` is an operator preflight for an unnamed
default audio family: existing worker Whisper detects language without iterating
transcript segments; it is not a replacement ASR service. No credentials or runtime
configuration changes. Clean only the task's temporary probe audio after use.

`prepare.py --allow-asr` requires an ASR receipt and retrieval path. Longer sources
use `lookup_transfer.py VIDEO_DIR --email AUTHORIZED_OWNER --reference REFERENCE`:
500query cap, priority lemmas and explicit deferred-query list. All source candidates
remain; unqueried is distinct from empty. Do not expose this operator lookup as a
model SQL/principal tool.

For the model continuation pass `--prior-ledger PRIOR_WIRE --lean-wire` to
transfer_run.py using a fresh phase directory: cap48 includes the previous18calls,
leaving at most30new requests. New20min window, cumulative byte budget includes the
prior ledger. Lean projection omits internal bindings, not definitions/examples.
Source-casing-only proposal corrections require a unique match and retain a receipt;
other unanchored phrases still fail. See multivideo/ASR-RESULT-20261018.md for actual
execution, observed failures, bounded coverage and costs. The nl-vandale fixture
scope is not an all-accessible/private-dictionaries search guarantee.
