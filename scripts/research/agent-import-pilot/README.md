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
