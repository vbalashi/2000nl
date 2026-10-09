from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

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
    if {
        "benchmarkId": source_sample.get("benchmarkId"),
        "selectionHash": source_sample.get("selectionHash"),
    } != {
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
    }:
        raise ValueError("The preflight must belong to the same benchmark selection")
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
