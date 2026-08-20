from __future__ import annotations

from collections import Counter
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Callable, Iterator

from .comparison import plateau_reached
from .judgment_provenance import load_bound_candidates


PILOT_BENCHMARK_ID = "nl-learner-pilot-v1"
PILOT_SPLIT_COUNTS = {"development": 40, "validation": 12, "holdout": 12}
PILOT_POS_COUNTS = {
    "noun": 24,
    "verb": 18,
    "adjective": 10,
    "adverb": 5,
    "function": 3,
    "minor": 4,
}
PILOT_POS_SENSE_COUNTS = {
    "noun": 30,
    "verb": 25,
    "adjective": 12,
    "adverb": 6,
    "function": 3,
    "minor": 4,
}
_FUNCTION_POS = {"vnw", "vw", "vz"}


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _pos_bucket(raw: Any) -> str:
    value = str(raw or "").strip().casefold()
    if value == "zn":
        return "noun"
    if value == "ww":
        return "verb"
    if value == "bn":
        return "adjective"
    if value == "bw":
        return "adverb"
    if value in _FUNCTION_POS:
        return "function"
    return "minor"


def validate_pilot_selection_contract(selection: dict[str, Any]) -> None:
    """Freeze the public 64-lemma/80-sense pilot contract without constraining fixtures."""
    if selection.get("benchmarkId") != PILOT_BENCHMARK_ID:
        return
    lemmas = selection.get("lemmas")
    if not isinstance(lemmas, list):
        raise ValueError("Pilot selection must contain lemmas")
    split_counts: Counter[str] = Counter()
    pos_counts: Counter[str] = Counter()
    pos_sense_counts: Counter[str] = Counter()
    meaning_count = 0
    for lemma in lemmas:
        if not isinstance(lemma, dict):
            raise ValueError("Pilot selection lemmas must be objects")
        split_counts[str(lemma.get("split") or "")] += 1
        pos_bucket = _pos_bucket(lemma.get("partOfSpeech"))
        pos_counts[pos_bucket] += 1
        meaning_ids = lemma.get("selectedMeaningIds")
        if (
            not isinstance(meaning_ids, list)
            or not meaning_ids
            or not all(
                isinstance(value, int) and not isinstance(value, bool) and value > 0
                for value in meaning_ids
            )
            or len(set(meaning_ids)) != len(meaning_ids)
        ):
            raise ValueError(
                "Pilot selection lemmas require unique positive selectedMeaningIds"
            )
        meaning_count += len(meaning_ids)
        pos_sense_counts[pos_bucket] += len(meaning_ids)
    if dict(split_counts) != PILOT_SPLIT_COUNTS:
        raise ValueError(
            f"Pilot selection split counts must be {PILOT_SPLIT_COUNTS}; got {dict(split_counts)}"
        )
    if dict(pos_counts) != PILOT_POS_COUNTS:
        raise ValueError(
            f"Pilot selection POS counts must be {PILOT_POS_COUNTS}; got {dict(pos_counts)}"
        )
    if dict(pos_sense_counts) != PILOT_POS_SENSE_COUNTS:
        raise ValueError(
            f"Pilot selection POS sense counts must be {PILOT_POS_SENSE_COUNTS}; "
            f"got {dict(pos_sense_counts)}"
        )
    if len(lemmas) != 64 or meaning_count != 80:
        raise ValueError("Pilot selection must contain exactly 64 lemmas and 80 senses")


def require_batch_preflight(
    *,
    sample: dict[str, Any],
    split: str,
    limit: int | None,
    preflight_run_dir: Path | None,
    prompt_id: str,
    prompt_hash: str,
    model: str,
    endpoint_fingerprint: str,
    preflight_sample: dict[str, Any] | None = None,
) -> None:
    requested_cases = [
        case for case in sample.get("cases") or [] if case.get("split") == split
    ]
    requested_count = (
        len(requested_cases) if limit is None else min(limit, len(requested_cases))
    )
    if requested_count <= 5:
        return
    if preflight_run_dir is None:
        raise ValueError("A benchmark batch requires a completed five-case preflight")
    source_sample = preflight_sample or sample
    preflight_cases = [
        case
        for case in source_sample.get("cases") or []
        if case.get("split") == "development"
    ][:5]
    if len(preflight_cases) != 5:
        raise ValueError("The preflight sample must contain five development cases")
    _, manifest = load_bound_candidates(
        sample=source_sample,
        candidate_dir=preflight_run_dir.resolve() / "candidates",
        cases=preflight_cases,
        split="development",
    )
    prompt = manifest.get("prompt") or {}
    expected = {
        "promptId": prompt_id,
        "promptHash": prompt_hash,
        "model": model,
        "endpointFingerprint": endpoint_fingerprint,
        "candidateCount": 5,
    }
    actual = {
        "promptId": prompt.get("promptId"),
        "promptHash": prompt.get("promptHash"),
        "model": manifest.get("model"),
        "endpointFingerprint": manifest.get("endpointFingerprint"),
        "candidateCount": manifest.get("candidateCount"),
    }
    if actual != expected:
        raise ValueError("Benchmark preflight does not match the requested immutable run")


def require_complete_sealed_holdout(
    *, sample: dict[str, Any], split: str, limit: int | None
) -> None:
    if not sample.get("sealed"):
        return
    cases = sample.get("cases")
    if (
        split != "holdout"
        or limit is not None
        or not isinstance(cases, list)
        or not cases
        or any(
            not isinstance(case, dict) or case.get("split") != "holdout"
            for case in cases
        )
        or sample.get("caseCount") != len(cases)
        or (sample.get("benchmarkId") == PILOT_BENCHMARK_ID and len(cases) != 12)
    ):
        raise ValueError(
            "A sealed holdout must run its complete immutable case set without --limit"
        )


@contextmanager
def tournament_round(
    *, ledger_path: Path, phase: str
) -> Iterator[Callable[[Path], None]]:
    """Serialize and record one bounded development or validation comparison."""
    if phase not in {"development", "validation"}:
        raise ValueError("Tournament phase must be development or validation")
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = ledger_path.with_name(f".{ledger_path.name}.lock")
    try:
        with lock_path.open("x", encoding="utf-8") as stream:
            stream.write("lexicography-tournament-lock-v1\n")
    except FileExistsError:
        raise ValueError("Another tournament comparison is already in progress") from None
    recorded = False
    try:
        if ledger_path.exists():
            ledger = _read_json(ledger_path)
            if ledger.get("schema") != "lexicography-tournament-ledger-v1":
                raise ValueError("Tournament ledger uses an unsupported schema")
            rounds = ledger.get("rounds")
            if not isinstance(rounds, list):
                raise ValueError("Tournament ledger rounds must be an array")
            if any(
                not isinstance(item, dict)
                or set(item)
                != {
                    "phase",
                    "incumbentPromptId",
                    "challengerPromptId",
                    "decision",
                    "comparisonSha256",
                }
                for item in rounds
            ):
                raise ValueError("Tournament ledger rounds use an unsupported shape")
        else:
            ledger = {
                "schema": "lexicography-tournament-ledger-v1",
                "benchmarkId": None,
                "selectionHash": None,
                "rounds": [],
            }
            rounds = ledger["rounds"]
        phase_rounds = [item for item in rounds if item.get("phase") == phase]
        if phase == "validation" and phase_rounds:
            raise ValueError("Validation may compare at most two frozen finalists once")
        if phase == "development" and plateau_reached(
            [item.get("decision") == "promote" for item in phase_rounds]
        ):
            raise ValueError("The prompt tournament has reached its stopping rule")

        def record(comparison_path: Path) -> None:
            nonlocal recorded
            if recorded:
                raise ValueError("Tournament round was already recorded")
            comparison = _read_json(comparison_path)
            if comparison.get("schema") != "lexicography-prompt-comparison-v2":
                raise ValueError("Tournament comparison uses an unsupported schema")
            provenance = comparison.get("evaluationProvenance") or {}
            if provenance.get("split") != phase:
                raise ValueError("Tournament phase does not match comparison provenance")
            binding = {
                "benchmarkId": provenance.get("benchmarkId"),
                "selectionHash": provenance.get("selectionHash"),
            }
            if not all(isinstance(value, str) and value for value in binding.values()):
                raise ValueError("Tournament comparison is missing benchmark provenance")
            existing_binding = {key: ledger.get(key) for key in binding}
            if any(existing_binding.values()) and existing_binding != binding:
                raise ValueError("Tournament ledger is bound to another benchmark selection")
            ledger.update(binding)
            decision = comparison.get("decision")
            if decision not in {"promote", "reject"}:
                raise ValueError("Tournament comparison has an invalid decision")
            incumbent_prompt_id = str(comparison.get("incumbentPromptId") or "")
            challenger_prompt_id = str(comparison.get("challengerPromptId") or "")
            if not incumbent_prompt_id or not challenger_prompt_id:
                raise ValueError("Tournament comparison is missing prompt identities")
            comparison_hash = _file_sha256(comparison_path)
            if any(item.get("comparisonSha256") == comparison_hash for item in rounds):
                raise ValueError("Tournament comparison is already recorded")
            rounds.append(
                {
                    "phase": phase,
                    "incumbentPromptId": incumbent_prompt_id,
                    "challengerPromptId": challenger_prompt_id,
                    "decision": decision,
                    "comparisonSha256": comparison_hash,
                }
            )
            rendered = json.dumps(ledger, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
            temporary = ledger_path.with_name(f".{ledger_path.name}.tmp")
            temporary.write_text(rendered, encoding="utf-8")
            os.replace(temporary, ledger_path)
            recorded = True

        yield record
    finally:
        lock_path.unlink(missing_ok=True)


def merge_open_and_holdout_selections(
    open_selection: dict[str, Any], holdout_selection: dict[str, Any]
) -> dict[str, Any]:
    if open_selection.get("schema") != "lexicography-selection-v1" or holdout_selection.get(
        "schema"
    ) != "lexicography-selection-v1":
        raise ValueError("Both benchmark selections must use lexicography-selection-v1")
    if open_selection.get("benchmarkId") != holdout_selection.get("benchmarkId"):
        raise ValueError("Open and holdout selections must share a benchmarkId")
    open_lemmas = list(open_selection.get("lemmas") or [])
    holdout_lemmas = list(holdout_selection.get("lemmas") or [])
    if not open_lemmas or any(item.get("split") == "holdout" for item in open_lemmas):
        raise ValueError("The committed open selection must not expose holdout cases")
    if not holdout_lemmas or any(item.get("split") != "holdout" for item in holdout_lemmas):
        raise ValueError("The vault selection must contain only holdout cases")
    expected_count = open_selection.get("reservedHoldoutCaseCount")
    if expected_count is not None and expected_count != len(holdout_lemmas):
        raise ValueError("Vault selection does not match reserved holdout count")
    merged = {
        "schema": "lexicography-selection-v1",
        "benchmarkId": open_selection.get("benchmarkId"),
        "seed": open_selection.get("seed"),
        "lemmas": open_lemmas + holdout_lemmas,
    }
    validate_pilot_selection_contract(merged)
    return merged


def require_holdout_binding(
    *,
    sample_path: Path,
    sample: dict[str, Any],
    ledger_path: Path | None,
    run_id: str | None,
    prompt_id: str | None,
    prompt_hash: str | None,
    generation_run_dir: Path | None,
    protected_path: Path | None = None,
) -> None:
    if not sample.get("sealed"):
        return
    normalized_run_id = str(run_id or "").strip()
    normalized_prompt_id = str(prompt_id or "").strip()
    normalized_prompt_hash = str(prompt_hash or "").strip()
    if (
        ledger_path is None
        or not normalized_run_id
        or not normalized_prompt_id
        or not normalized_prompt_hash
        or generation_run_dir is None
    ):
        raise ValueError(
            "The sealed holdout requires its release ledger, run ID, frozen prompt, and generation run"
        )
    if len(normalized_run_id) > 128 or any(
        character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
        for character in normalized_run_id
    ):
        raise ValueError("Holdout run ID contains unsupported characters")
    sample_path = sample_path.resolve()
    ledger_path = ledger_path.resolve()
    if sample_path.parent != ledger_path.parent:
        raise ValueError("Holdout sample and release ledger must share a release directory")
    ledger = _read_json(ledger_path)
    if ledger.get("schema") != "lexicography-holdout-release-ledger-v1":
        raise ValueError("Holdout release ledger has an unsupported schema")
    if ledger.get("benchmarkId") != sample.get("benchmarkId"):
        raise ValueError("Holdout release ledger benchmark does not match the sample")
    sample_sha = _file_sha256(sample_path)
    if ledger.get("sampleSha256") != sample_sha:
        raise ValueError("Holdout sample no longer matches its immutable release ledger")
    if protected_path is not None:
        protected_path = protected_path.resolve()
        if protected_path.parent != sample_path.parent:
            raise ValueError("Holdout protected references must remain in the release directory")
        if ledger.get("protectedSha256") != _file_sha256(protected_path):
            raise ValueError(
                "Holdout protected references no longer match the immutable release ledger"
            )

    binding_path = ledger_path.parent / str(ledger.get("bindingFile") or "run-binding.json")
    binding = {
        "schema": "lexicography-holdout-run-binding-v1",
        "benchmarkId": sample.get("benchmarkId"),
        "runId": normalized_run_id,
        "promptId": normalized_prompt_id,
        "promptHash": normalized_prompt_hash,
        "generationRunPathHash": hashlib.sha256(
            str(generation_run_dir.resolve()).encode("utf-8")
        ).hexdigest(),
        "sampleSha256": sample_sha,
        "ledgerSha256": _file_sha256(ledger_path),
    }
    if binding_path.exists():
        existing = _read_json(binding_path)
        if existing != binding:
            raise ValueError(
                f"Holdout release is already bound to run {existing.get('runId')!r}"
            )
        return
    rendered = json.dumps(binding, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    try:
        with binding_path.open("x", encoding="utf-8") as stream:
            stream.write(rendered)
    except FileExistsError:
        existing = _read_json(binding_path)
        if existing != binding:
            raise ValueError(
                f"Holdout release is already bound to run {existing.get('runId')!r}"
            ) from None
    os.chmod(binding_path, 0o400)
