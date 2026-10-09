from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.holdout_policy import (  # noqa: E402
    require_complete_sealed_holdout,
    require_holdout_binding,
)
from lexicography_eval.release_policy import (  # noqa: E402
    PILOT_BENCHMARK_ID,
    require_batch_preflight,
    validate_pilot_selection_contract,
)
from lexicography_eval.tournament_policy import (  # noqa: E402
    tournament_round,
    validated_tournament_release,
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

    foreign_sample = {**sample, "benchmarkId": "other-benchmark"}
    with pytest.raises(ValueError, match="benchmark selection"):
        require_batch_preflight(
            sample=validation_sample, split="validation", limit=None,
            preflight_run_dir=preflight_run, prompt_id="challenger",
            prompt_hash=prompt_hash, model="gpt-4.1",
            endpoint_fingerprint="azure:unit-test",
            preflight_sample=foreign_sample,
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


def _comparison(
    path: Path,
    *,
    phase: str,
    decision: str,
    incumbent_index: int,
    challenger_index: int,
) -> None:
    path.write_text(
        json.dumps(
            {
                "schema": "lexicography-prompt-comparison-v2",
                "incumbentPromptId": f"prompt-{incumbent_index}",
                "challengerPromptId": f"prompt-{challenger_index}",
                "incumbentFinalist": {
                    "promptId": f"prompt-{incumbent_index}",
                    "promptHash": f"{incumbent_index:064x}",
                    "model": "gpt-4.1",
                },
                "challengerFinalist": {
                    "promptId": f"prompt-{challenger_index}",
                    "promptHash": f"{challenger_index:064x}",
                    "model": "gpt-4.1",
                },
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
        _comparison(
            artifact, phase="development", decision="reject",
            incumbent_index=0, challenger_index=index + 1,
        )
        with tournament_round(ledger_path=failure_ledger, phase="development") as record:
            record(artifact)
    with pytest.raises(ValueError, match="stopping rule"):
        with tournament_round(ledger_path=failure_ledger, phase="development"):
            pass

    cap_ledger = tmp_path / "cap-ledger.json"
    incumbent_index = 0
    for index in range(8):
        artifact = tmp_path / f"cap-{index}.json"
        challenger_index = index + 1
        decision = "promote" if index % 3 == 0 else "reject"
        _comparison(
            artifact, phase="development", decision=decision,
            incumbent_index=incumbent_index, challenger_index=challenger_index,
        )
        with tournament_round(ledger_path=cap_ledger, phase="development") as record:
            record(artifact)
        if decision == "promote":
            incumbent_index = challenger_index
    with pytest.raises(ValueError, match="stopping rule"):
        with tournament_round(ledger_path=cap_ledger, phase="development"):
            pass

    validation_ledger = tmp_path / "validation-ledger.json"
    for index in range(3):
        development = tmp_path / f"validation-ledger-development-{index}.json"
        _comparison(
            development, phase="development", decision="reject",
            incumbent_index=0, challenger_index=index + 1,
        )
        with tournament_round(ledger_path=validation_ledger, phase="development") as record:
            record(development)
    artifact = tmp_path / "validation.json"
    _comparison(
        artifact, phase="validation", decision="promote",
        incumbent_index=0, challenger_index=3,
    )
    with tournament_round(ledger_path=validation_ledger, phase="validation") as record:
        record(artifact)
    ledger = json.loads(validation_ledger.read_text(encoding="utf-8"))
    assert ledger["finalist"]["promptId"] == "prompt-3"
    with pytest.raises(ValueError, match="two frozen finalists"):
        with tournament_round(ledger_path=validation_ledger, phase="validation"):
            pass
    with pytest.raises(ValueError, match="stopping rule"):
        with tournament_round(ledger_path=validation_ledger, phase="development"):
            pass


def test_tournament_rejects_a_disconnected_incumbent(tmp_path: Path) -> None:
    ledger_path = tmp_path / "tournament.json"
    first = tmp_path / "first.json"
    _comparison(
        first, phase="development", decision="reject",
        incumbent_index=0, challenger_index=1,
    )
    with tournament_round(ledger_path=ledger_path, phase="development") as record:
        record(first)

    disconnected = tmp_path / "disconnected.json"
    _comparison(
        disconnected, phase="development", decision="promote",
        incumbent_index=1, challenger_index=2,
    )
    with tournament_round(ledger_path=ledger_path, phase="development") as record:
        with pytest.raises(ValueError, match="previous round winner"):
            record(disconnected)


def test_tournament_never_recycles_an_earlier_participant_as_challenger(
    tmp_path: Path,
) -> None:
    ledger_path = tmp_path / "tournament.json"
    first = tmp_path / "first.json"
    _comparison(
        first, phase="development", decision="promote",
        incumbent_index=0, challenger_index=1,
    )
    with tournament_round(ledger_path=ledger_path, phase="development") as record:
        record(first)

    recycled = tmp_path / "recycled.json"
    _comparison(
        recycled, phase="development", decision="reject",
        incumbent_index=1, challenger_index=0,
    )
    with tournament_round(ledger_path=ledger_path, phase="development") as record:
        with pytest.raises(ValueError, match="new challenger identity"):
            record(recycled)


def _completed_tournament_ledger(tmp_path: Path) -> Path:
    ledger_path = tmp_path / "completed-tournament.json"
    for index in range(3):
        artifact = tmp_path / f"completed-development-{index}.json"
        _comparison(
            artifact, phase="development", decision="reject",
            incumbent_index=0, challenger_index=index + 1,
        )
        with tournament_round(ledger_path=ledger_path, phase="development") as record:
            record(artifact)
    validation = tmp_path / "completed-validation.json"
    _comparison(
        validation, phase="validation", decision="promote",
        incumbent_index=0, challenger_index=3,
    )
    with tournament_round(ledger_path=ledger_path, phase="validation") as record:
        record(validation)
    return ledger_path


@pytest.mark.parametrize(
    "corruption",
    ["phase", "duplicate-hash", "winner", "frozen-pair", "finalist"],
)
def test_tournament_release_fails_closed_on_corrupt_derived_state(
    tmp_path: Path, corruption: str,
) -> None:
    ledger_path = _completed_tournament_ledger(tmp_path)
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    if corruption == "phase":
        ledger["rounds"][0]["phase"] = "invented"
    elif corruption == "duplicate-hash":
        ledger["rounds"][1]["comparisonSha256"] = ledger["rounds"][0]["comparisonSha256"]
    elif corruption == "winner":
        ledger["currentWinner"] = ledger["rounds"][0]["challenger"]
    elif corruption == "frozen-pair":
        ledger["validationFinalists"] = list(reversed(ledger["validationFinalists"]))
    else:
        ledger["finalist"] = ledger["rounds"][-1]["incumbent"]
    ledger_path.write_text(json.dumps(ledger), encoding="utf-8")

    with pytest.raises(ValueError):
        validated_tournament_release(ledger_path)


def _historical_holdout_fixture(tmp_path: Path) -> tuple[dict, Path, Path, Path]:
    repo_root = tmp_path / "repo"
    release = repo_root / "reports/generated/lexicography-eval-vault/release"
    release.mkdir(parents=True)
    sample_path = release / "sealed.json"
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": PILOT_BENCHMARK_ID,
        "selectionHash": "s" * 64,
        "sealed": True,
        "caseCount": 1,
        "cases": [{"caseId": "one", "split": "holdout"}],
    }
    sample_path.write_text(json.dumps(sample), encoding="utf-8")
    ledger_path = release / "release-ledger.json"
    ledger_path.write_text(json.dumps({
        "schema": "lexicography-holdout-release-ledger-v1",
        "benchmarkId": PILOT_BENCHMARK_ID,
        "selectionHash": sample["selectionHash"],
        "sampleSha256": hashlib.sha256(sample_path.read_bytes()).hexdigest(),
    }), encoding="utf-8")
    run_dir = repo_root / "reports/generated/lexicography-eval/pilot/holdout-run"
    run_dir.mkdir(parents=True)
    validation_root = repo_root / "reports/generated/lexicography-eval/pilot/validation"
    validation_root.mkdir(parents=True)
    manifest_paths = []
    for prompt_id, prompt_hash in (("finalist-a", "a" * 64), ("finalist-b", "b" * 64)):
        path = validation_root / f"{prompt_id}.json"
        path.write_text(json.dumps({
            "schema": "lexicography-run-manifest-v1",
            "benchmarkId": PILOT_BENCHMARK_ID,
            "selectionHash": sample["selectionHash"],
            "split": "validation",
            "model": "gpt-4.1",
            "prompt": {"promptId": prompt_id, "promptHash": prompt_hash},
        }), encoding="utf-8")
        manifest_paths.append(path)
    finalist_path = repo_root / "packages/ingestion/lexicography_eval/finalist.json"
    finalist_path.parent.mkdir(parents=True)
    finalist_path.write_text(json.dumps({
        "schema": "lexicography-finalist-decision-v1",
        "benchmarkId": PILOT_BENCHMARK_ID,
        "selectionHash": sample["selectionHash"],
        "selectionProtocol": "historical-human-validation-v1",
        "generator": {
            "promptId": "finalist-b", "promptHash": "b" * 64, "model": "gpt-4.1",
        },
        "validationEvidence": {
            "selectedPromptId": "finalist-b",
            "candidateManifests": [
                {
                    "path": str(path.relative_to(repo_root)),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }
                for path in manifest_paths
            ],
        },
    }), encoding="utf-8")
    kwargs = {
        "sample_path": sample_path,
        "sample": sample,
        "ledger_path": ledger_path,
        "finalist_path": finalist_path,
        "tournament_ledger_path": None,
        "run_id": "historical-run",
        "prompt_id": "finalist-b",
        "prompt_hash": "b" * 64,
        "model": "gpt-4.1",
        "generation_run_dir": run_dir,
    }
    return kwargs, release / "run-binding.json", manifest_paths[1], finalist_path


def test_historical_protocol_cannot_create_a_new_holdout_binding(tmp_path: Path) -> None:
    kwargs, binding_path, _, _ = _historical_holdout_fixture(tmp_path)
    with pytest.raises(ValueError, match="cannot open a new sealed holdout"):
        require_holdout_binding(**kwargs)
    assert not binding_path.exists()


@pytest.mark.parametrize(
    "corruption", ["manifest", "missing", "path", "benchmark", "selection", "selected"]
)
def test_historical_protocol_rejects_corrupt_validation_evidence(
    tmp_path: Path, corruption: str,
) -> None:
    kwargs, binding_path, selected_manifest, finalist_path = _historical_holdout_fixture(tmp_path)
    expected = {
        "schema": "lexicography-holdout-run-binding-v1",
        "benchmarkId": PILOT_BENCHMARK_ID,
        "runId": "historical-run",
        "promptId": "finalist-b",
        "promptHash": "b" * 64,
        "generationRunPathHash": hashlib.sha256(
            str(kwargs["generation_run_dir"].resolve()).encode("utf-8")
        ).hexdigest(),
        "sampleSha256": hashlib.sha256(kwargs["sample_path"].read_bytes()).hexdigest(),
        "ledgerSha256": hashlib.sha256(kwargs["ledger_path"].read_bytes()).hexdigest(),
    }
    binding_path.write_text(json.dumps(expected), encoding="utf-8")
    finalist = json.loads(finalist_path.read_text(encoding="utf-8"))
    if corruption == "manifest":
        selected_manifest.write_text("{}", encoding="utf-8")
    elif corruption == "missing":
        selected_manifest.unlink()
    elif corruption == "path":
        finalist["validationEvidence"]["candidateManifests"][1]["path"] = "../outside.json"
        finalist_path.write_text(json.dumps(finalist), encoding="utf-8")
    elif corruption in {"benchmark", "selection"}:
        manifest = json.loads(selected_manifest.read_text(encoding="utf-8"))
        manifest[
            "benchmarkId" if corruption == "benchmark" else "selectionHash"
        ] = "foreign"
        selected_manifest.write_text(json.dumps(manifest), encoding="utf-8")
        finalist["validationEvidence"]["candidateManifests"][1]["sha256"] = hashlib.sha256(
            selected_manifest.read_bytes()
        ).hexdigest()
        finalist_path.write_text(json.dumps(finalist), encoding="utf-8")
    else:
        finalist["validationEvidence"]["selectedPromptId"] = "finalist-a"
        finalist_path.write_text(json.dumps(finalist), encoding="utf-8")

    with pytest.raises(ValueError):
        require_holdout_binding(**kwargs)
