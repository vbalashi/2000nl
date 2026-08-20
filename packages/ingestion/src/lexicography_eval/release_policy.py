from __future__ import annotations

from collections import Counter
import hashlib
import json
import os
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
    meaning_count = 0
    for lemma in lemmas:
        if not isinstance(lemma, dict):
            raise ValueError("Pilot selection lemmas must be objects")
        split_counts[str(lemma.get("split") or "")] += 1
        pos_counts[_pos_bucket(lemma.get("partOfSpeech"))] += 1
        meaning_ids = lemma.get("selectedMeaningIds")
        if not isinstance(meaning_ids, list) or not meaning_ids:
            raise ValueError("Pilot selection lemmas require selectedMeaningIds")
        meaning_count += len(meaning_ids)
    if dict(split_counts) != PILOT_SPLIT_COUNTS:
        raise ValueError(
            f"Pilot selection split counts must be {PILOT_SPLIT_COUNTS}; got {dict(split_counts)}"
        )
    if dict(pos_counts) != PILOT_POS_COUNTS:
        raise ValueError(
            f"Pilot selection POS counts must be {PILOT_POS_COUNTS}; got {dict(pos_counts)}"
        )
    if len(lemmas) != 64 or meaning_count != 80:
        raise ValueError("Pilot selection must contain exactly 64 lemmas and 80 senses")


def require_development_preflight(
    *,
    sample: dict[str, Any],
    split: str,
    limit: int | None,
    preflight_run_dir: Path | None,
    prompt_id: str,
    prompt_hash: str,
    model: str,
    endpoint_fingerprint: str,
) -> None:
    development_cases = [
        case for case in sample.get("cases") or [] if case.get("split") == "development"
    ]
    requested_count = len(development_cases) if limit is None else min(limit, len(development_cases))
    if split != "development" or requested_count <= 5:
        return
    if preflight_run_dir is None:
        raise ValueError("A full development run requires a completed five-case preflight")
    preflight_cases = development_cases[:5]
    _, manifest = load_bound_candidates(
        sample=sample,
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
        raise ValueError("Development preflight does not match the requested immutable run")


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
