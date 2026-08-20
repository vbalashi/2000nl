from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.release_policy import (  # noqa: E402
    PILOT_BENCHMARK_ID,
    require_development_preflight,
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
    return {
        "schema": "lexicography-selection-v1",
        "benchmarkId": PILOT_BENCHMARK_ID,
        "lemmas": [
            {
                "headword": f"lemma-{index}",
                "partOfSpeech": parts_of_speech[index],
                "selectedMeaningIds": [1, 2] if index < 16 else [1],
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
            invalid["lemmas"][0]["selectedMeaningIds"] = [1]
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
        require_development_preflight(
            sample=sample, split="development", limit=None, preflight_run_dir=None,
            prompt_id="challenger", prompt_hash=prompt_hash, model="gpt-4.1",
            endpoint_fingerprint="azure:unit-test",
        )

    require_development_preflight(
        sample=sample, split="development", limit=None,
        preflight_run_dir=preflight_run, prompt_id="challenger",
        prompt_hash=prompt_hash, model="gpt-4.1",
        endpoint_fingerprint="azure:unit-test",
    )
    with pytest.raises(ValueError, match="does not match"):
        require_development_preflight(
            sample=sample, split="development", limit=None,
            preflight_run_dir=preflight_run, prompt_id="other",
            prompt_hash=prompt_hash, model="gpt-4.1",
            endpoint_fingerprint="azure:unit-test",
        )
