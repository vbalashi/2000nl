from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.release_policy import (  # noqa: E402
    PILOT_BENCHMARK_ID,
    require_complete_sealed_holdout,
    require_batch_preflight,
    tournament_round,
    validate_pilot_selection_contract,
)
from lexicography_eval_fixtures import write_bound_generation_run  # noqa: E402


def _article(headword: str) -> dict:
    return {
        "headword": headword,
        "partOfSpeech": "zn",
        "senses": [{
            "definition": f"een betekenis van {headword}",
            "usageNote": None,
            "usagePattern": None,
            "examples": [f"Dit is {headword}.", f"Ik ken {headword}."],
            "collocations": [],
            "synonyms": [],
            "idioms": [],
        }],
    }


def _pilot_selection() -> dict:
    splits = ["development"] * 40 + ["validation"] * 12 + ["holdout"] * 12
    parts_of_speech = (
        ["zn"] * 24 + ["ww"] * 18 + ["bn"] * 10 + ["bw"] * 5
        + ["vnw"] * 3 + ["tw"] * 4
    )
    extra_sense_indexes = set(range(6)) | set(range(24, 31)) | {42, 43, 52}
    return {
        "schema": "lexicography-selection-v1",
        "benchmarkId": PILOT_BENCHMARK_ID,
        "lemmas": [
            {
                "headword": f"lemma-{index}",
                "partOfSpeech": parts_of_speech[index],
                "selectedMeaningIds": [1, 2] if index in extra_sense_indexes else [1],
                "split": splits[index],
            }
            for index in range(64)
        ],
    }


def test_pilot_selection_enforces_exact_lemma_sense_split_and_pos_contract() -> None:
    selection = _pilot_selection()
    validate_pilot_selection_contract(selection)

    for mutation in ("split", "pos", "senses"):
        invalid = deepcopy(selection)
        if mutation == "split":
            invalid["lemmas"][0]["split"] = "validation"
        elif mutation == "pos":
            invalid["lemmas"][0]["partOfSpeech"] = "ww"
        else:
            invalid["lemmas"][0]["selectedMeaningIds"] = [1, 1]
        with pytest.raises(ValueError):
            validate_pilot_selection_contract(invalid)


def test_full_development_generation_requires_matching_five_case_preflight(
    tmp_path: Path,
) -> None:
    cases = [
        {
            "caseId": f"case-{index}",
            "split": "development",
            "generationInput": {
                "headword": f"woord-{index}",
                "partOfSpeech": "zn",
            },
        }
        for index in range(6)
    ]
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "preflight-test",
        "selectionHash": "selection-hash",
        "cases": cases,
    }
    prompt_hash = "f" * 64
    preflight_candidates = write_bound_generation_run(
        tmp_path / "preflight",
        sample=sample,
        cases=cases[:5],
        split="development",
        articles={case["caseId"]: _article(case["generationInput"]["headword"]) for case in cases[:5]},
        prompt_id="challenger",
        prompt_hash=prompt_hash,
    )
    preflight_run = preflight_candidates.parent

    with pytest.raises(ValueError, match="five-case preflight"):
        require_batch_preflight(
            sample=sample, split="development", limit=None, preflight_run_dir=None,
            prompt_id="challenger", prompt_hash=prompt_hash, model="gpt-4.1",
            endpoint_fingerprint="azure:unit-test",
        )

    require_batch_preflight(
        sample=sample, split="development", limit=None,
        preflight_run_dir=preflight_run, prompt_id="challenger",
        prompt_hash=prompt_hash, model="gpt-4.1",
        endpoint_fingerprint="azure:unit-test",
    )
    with pytest.raises(ValueError, match="does not match"):
        require_batch_preflight(
            sample=sample, split="development", limit=None,
            preflight_run_dir=preflight_run, prompt_id="other",
            prompt_hash=prompt_hash, model="gpt-4.1",
            endpoint_fingerprint="azure:unit-test",
        )

    validation_sample = {
        **sample,
        "cases": cases + [
            {**case, "caseId": f"validation-{index}", "split": "validation"}
            for index, case in enumerate(cases)
        ],
    }
    with pytest.raises(ValueError, match="five-case preflight"):
        require_batch_preflight(
            sample=validation_sample, split="validation", limit=None,
            preflight_run_dir=None, prompt_id="challenger", prompt_hash=prompt_hash,
            model="gpt-4.1", endpoint_fingerprint="azure:unit-test",
        )
    require_batch_preflight(
        sample=validation_sample, split="validation", limit=None,
        preflight_run_dir=preflight_run, prompt_id="challenger",
        prompt_hash=prompt_hash, model="gpt-4.1",
        endpoint_fingerprint="azure:unit-test",
    )


def test_sealed_holdout_must_run_the_complete_case_set() -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "sealed": True,
        "caseCount": 2,
        "cases": [
            {"caseId": "one", "split": "holdout"},
            {"caseId": "two", "split": "holdout"},
        ],
    }
    require_complete_sealed_holdout(sample=sample, split="holdout", limit=None)
    with pytest.raises(ValueError, match="complete immutable"):
        require_complete_sealed_holdout(sample=sample, split="holdout", limit=1)


def _comparison(path: Path, *, phase: str, decision: str, index: int) -> None:
    path.write_text(
        json.dumps(
            {
                "schema": "lexicography-prompt-comparison-v2",
                "incumbentPromptId": f"prompt-{index}",
                "challengerPromptId": f"prompt-{index + 1}",
                "evaluationProvenance": {
                    "split": phase,
                    "benchmarkId": "benchmark",
                    "selectionHash": "selection-hash",
                },
                "decision": decision,
            }
        ),
        encoding="utf-8",
    )


def test_tournament_ledger_enforces_failure_plateau_round_cap_and_two_finalists(
    tmp_path: Path,
) -> None:
    failure_ledger = tmp_path / "failure-ledger.json"
    for index in range(3):
        artifact = tmp_path / f"failure-{index}.json"
        _comparison(artifact, phase="development", decision="reject", index=index)
        with tournament_round(ledger_path=failure_ledger, phase="development") as record:
            record(artifact)
    with pytest.raises(ValueError, match="stopping rule"):
        with tournament_round(ledger_path=failure_ledger, phase="development"):
            pass

    cap_ledger = tmp_path / "cap-ledger.json"
    for index in range(8):
        artifact = tmp_path / f"cap-{index}.json"
        _comparison(
            artifact, phase="development",
            decision="promote" if index % 3 == 0 else "reject", index=index,
        )
        with tournament_round(ledger_path=cap_ledger, phase="development") as record:
            record(artifact)
    with pytest.raises(ValueError, match="stopping rule"):
        with tournament_round(ledger_path=cap_ledger, phase="development"):
            pass

    validation_ledger = tmp_path / "validation-ledger.json"
    artifact = tmp_path / "validation.json"
    _comparison(artifact, phase="validation", decision="promote", index=1)
    with tournament_round(ledger_path=validation_ledger, phase="validation") as record:
        record(artifact)
    with pytest.raises(ValueError, match="two frozen finalists"):
        with tournament_round(ledger_path=validation_ledger, phase="validation"):
            pass
